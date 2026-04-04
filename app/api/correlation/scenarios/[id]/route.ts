import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, createClient } from '@/lib/supabase/server'

/**
 * DELETE /api/correlation/scenarios/[id]
 *
 * Delete a specific correlation pattern
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const client = await createClient()

  // Delete the scenario (cascade will delete occurrences)
  const { error } = await client
    .from('correlation_scenarios')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id) // Ensure user owns this pattern

  if (error) {
    console.error('[DeleteScenarioAPI] Error:', error)
    return NextResponse.json(
      { error: 'Failed to delete pattern' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
