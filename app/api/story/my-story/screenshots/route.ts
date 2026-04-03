import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/story/my-story/screenshots
 * Uploads a screenshot and links it to a story entry.
 */
export async function POST(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const formData = await req.formData()
        const file = formData.get('file') as File
        const entryId = formData.get('entryId') as string
        const label = formData.get('label') as string || 'Chart Screenshot'

        if (!file || !entryId) {
            return NextResponse.json({ error: 'File and Entry ID are required' }, { status: 400 })
        }

        const supabase = await createClient()
        const serviceClient = createServiceClient() // Use service role for storage if needed, or stick to user if RLS is set

        // 1. Upload to Storage
        const fileExt = file.name.split('.').pop()
        const fileName = `${user.id}/${entryId}/${crypto.randomUUID()}.${fileExt}`
        
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('story-screenshots')
            .upload(fileName, file, {
                contentType: file.type,
                upsert: true
            })

        if (uploadError) {
            console.error('Storage upload error:', uploadError)
            return NextResponse.json({ error: 'Failed to upload to storage' }, { status: 500 })
        }

        // 2. Link in Database
        const { data: screenData, error: dbError } = await supabase
            .from('user_story_screenshots')
            .insert({
                entry_id: entryId,
                user_id: user.id,
                storage_path: uploadData.path,
                label
            })
            .select()
            .single()

        if (dbError) {
            console.error('Database link error:', dbError)
            return NextResponse.json({ error: 'Failed to link screenshot in database' }, { status: 500 })
        }

        // 3. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('story-screenshots')
            .getPublicUrl(uploadData.path)

        return NextResponse.json({ 
            success: true, 
            screenshot: { ...screenData, publicUrl } 
        })

    } catch (err) {
        console.error('Screenshot upload error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/**
 * DELETE /api/story/my-story/screenshots?id=...
 */
export async function DELETE(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const supabase = await createClient()

    // 1. Get path first
    const { data: screen, error: fetchError } = await supabase
        .from('user_story_screenshots')
        .select('storage_path')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

    if (fetchError || !screen) {
        return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
    }

    // 2. Delete from Storage
    await supabase.storage.from('story-screenshots').remove([screen.storage_path])

    // 3. Delete from DB
    const { error: deleteError } = await supabase
        .from('user_story_screenshots')
        .delete()
        .eq('id', id)

    if (deleteError) {
        return NextResponse.json({ error: 'Failed to delete from database' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
