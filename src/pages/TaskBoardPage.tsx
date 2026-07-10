// src/pages/TaskBoardPage.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import NavBar from '../components/NavBar'
import { Pencil } from 'lucide-react'
import { isManagerRole } from '../lib/roles'

interface TaskItem {
  id: string
  label: string
  is_checked: boolean
}

interface Task {
  id: string
  title: string
  visibility: 'me' | 'me_and_nick' | 'everyone'
  is_completed: boolean
  created_by: string
  created_at: string
  task_items: TaskItem[]
}

interface FormItem {
  id?: string
  label: string
}

function getNextExpiry(): string {
  const now = new Date()
  const expiry = new Date()
  expiry.setHours(2, 0, 0, 0)
  if (expiry <= now) expiry.setDate(expiry.getDate() + 1)
  return expiry.toISOString()
}

export default function TaskBoardPage() {
  const { user, profile } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newVisibility, setNewVisibility] = useState<'me' | 'me_and_nick' | 'everyone'>('everyone')
  const [formItems, setFormItems] = useState<FormItem[]>([{ label: '' }])
  const [saving, setSaving] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)

  async function fetchTasks() {
    if (!profile?.org_id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('*, task_items(*)')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })
    if (!error && data) {
      const filtered = (data as Task[]).filter(task => {
        if (task.visibility === 'everyone') return true
        if (task.created_by === user?.id) return true
        // FIX: any manager can see "Me & Manager" tasks, not just one
        // hardcoded user. Works for every org, every manager.
        if (task.visibility === 'me_and_nick' && isManagerRole(profile?.role)) return true
        return false
      })
      setTasks(filtered)
    }
    setLoading(false)
  }

  useEffect(() => { fetchTasks() }, [profile?.org_id])

  function resetForm() {
    setEditingTaskId(null)
    setNewTitle('')
    setNewVisibility('everyone')
    setFormItems([{ label: '' }])
    setShowForm(false)
  }

  function handleOpenCreate() {
    setEditingTaskId(null)
    setNewTitle('')
    setNewVisibility('everyone')
    setFormItems([{ label: '' }])
    setShowForm(true)
  }

  // NEW: populate the form with an existing task's data for editing
  function handleOpenEdit(task: Task) {
    setEditingTaskId(task.id)
    setNewTitle(task.title)
    setNewVisibility(task.visibility)
    setFormItems(task.task_items.map(i => ({ id: i.id, label: i.label })))
    setShowForm(true)
  }

  async function handleSaveTask() {
    if (!newTitle.trim() || !user) return
    const validItems = formItems.filter(i => i.label.trim())
    if (validItems.length === 0) return
    if (!profile?.org_id) return
    setSaving(true)

    if (editingTaskId) {
      // ── Update existing task ──
      await supabase
        .from('tasks')
        .update({ title: newTitle.trim(), visibility: newVisibility })
        .eq('id', editingTaskId)

      const originalTask = tasks.find(t => t.id === editingTaskId)
      const originalItems = originalTask?.task_items ?? []

      // Items the user removed from the list — delete them
      const removedItems = originalItems.filter(
        orig => !validItems.some(v => v.id === orig.id)
      )
      for (const item of removedItems) {
        await supabase.from('task_items').delete().eq('id', item.id)
      }

      // Items that already existed — push the (possibly edited) label
      const existingItems = validItems.filter(i => i.id)
      for (const item of existingItems) {
        await supabase.from('task_items').update({ label: item.label.trim() }).eq('id', item.id!)
      }

      // Brand-new items typed during this edit — insert them
      const brandNewItems = validItems.filter(i => !i.id)
      if (brandNewItems.length > 0) {
        await supabase.from('task_items').insert(
          brandNewItems.map(i => ({ task_id: editingTaskId, label: i.label.trim() }))
        )
      }
    } else {
      // ── Create new task ──
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({
          org_id: profile.org_id,
          title: newTitle.trim(),
          visibility: newVisibility,
          created_by: user.id,
          expires_at: getNextExpiry(),
        })
        .select()
        .single()

      if (taskError || !taskData) { setSaving(false); return }

      await supabase.from('task_items').insert(
        validItems.map(i => ({ task_id: taskData.id, label: i.label.trim() }))
      )
    }

    resetForm()
    setSaving(false)
    fetchTasks()
  }

  async function handleCheck(taskId: string, itemId: string, currentValue: boolean) {
    await supabase
      .from('task_items')
      .update({ is_checked: !currentValue })
      .eq('id', itemId)

    const { data: allItems } = await supabase
      .from('task_items')
      .select('id, is_checked')
      .eq('task_id', taskId)

    if (allItems) {
      const updated = allItems.map(i =>
        i.id === itemId ? { ...i, is_checked: !currentValue } : i
      )
      const allChecked = updated.length > 0 && updated.every(i => i.is_checked)
      await supabase
        .from('tasks')
        .update({ is_completed: allChecked })
        .eq('id', taskId)
    }

    fetchTasks()
  }

  async function handleDelete(taskId: string) {
    await supabase.from('tasks').delete().eq('id', taskId)
    fetchTasks()
  }

  const activeTasks = tasks.filter(t => !t.is_completed)
  const completedTasks = tasks.filter(t => t.is_completed)

  const canManageTask = (task: Task) =>
    task.created_by === user?.id || isManagerRole(profile?.role)

  const visibilityLabel = (v: string) => {
    if (v === 'me') return 'Only me'
    if (v === 'me_and_nick') return 'Me & Manager'
    return 'Everyone'
  }

  const visibilityColor = (v: string) => {
    if (v === 'me') return 'bg-gray-100 text-gray-600'
    if (v === 'me_and_nick') return 'bg-blue-100 text-blue-700'
    return 'bg-teal-100 text-teal-700'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6">

        {loading && (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading tasks...</div>
        )}

        {!loading && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Task Board</h1>
              <button
                onClick={() => (showForm ? resetForm() : handleOpenCreate())}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: '#004B93' }}
              >
                <span className="text-lg leading-none">+</span> New Task
              </button>
            </div>

            {/* Create / Edit Task Form */}
            {showForm && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 shadow-sm">
                <p className="text-sm font-semibold text-gray-700 mb-3">
                  {editingTaskId ? 'Edit Task' : 'New Task'}
                </p>

                <input
                  type="text"
                  placeholder="Task title..."
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2"
                />

                <p className="text-xs text-gray-500 mb-2">Checklist items</p>
                {formItems.map((item, idx) => (
                  <div key={item.id ?? `new-${idx}`} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder={`Item ${idx + 1}...`}
                      value={item.label}
                      onChange={e => {
                        const updated = [...formItems]
                        updated[idx] = { ...updated[idx], label: e.target.value }
                        setFormItems(updated)
                      }}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    />
                    {formItems.length > 1 && (
                      <button
                        onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600 text-lg px-1"
                      >×</button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setFormItems([...formItems, { label: '' }])}
                  className="text-xs text-blue-600 hover:underline mb-4"
                >+ Add item</button>

                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-1">Visible to</p>
                  <div className="flex gap-2 flex-wrap">
                    {(['me', 'me_and_nick', 'everyone'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setNewVisibility(v)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                          newVisibility === v
                            ? 'border-transparent text-white'
                            : 'border-gray-200 text-gray-500 bg-white'
                        }`}
                        style={newVisibility === v ? { backgroundColor: '#004B93' } : {}}
                      >
                        {visibilityLabel(v)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveTask}
                    disabled={saving}
                    className="flex-1 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                    style={{ backgroundColor: '#004B93' }}
                  >
                    {saving ? 'Saving...' : editingTaskId ? 'Save Changes' : 'Create Task'}
                  </button>
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Active Tasks */}
            {activeTasks.length === 0 && !showForm && (
              <div className="text-center text-gray-400 py-12 text-sm">
                No active tasks. Hit <strong>New Task</strong> to get started.
              </div>
            )}

            <div className="space-y-3 mb-6">
              {activeTasks.map(task => (
                <div key={task.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{task.title}</p>
                      <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${visibilityColor(task.visibility)}`}>
                        {visibilityLabel(task.visibility)}
                      </span>
                    </div>
                    {canManageTask(task) && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <button
                          onClick={() => handleOpenEdit(task)}
                          className="text-gray-300 hover:text-[#004B93] transition"
                          aria-label="Edit task"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="text-gray-300 hover:text-red-400 text-lg leading-none"
                        >×</button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {task.task_items.map(item => (
                      <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={item.is_checked}
                          onChange={() => handleCheck(task.id, item.id, item.is_checked)}
                          className="w-4 h-4 rounded accent-teal-500"
                        />
                        <span className={`text-sm ${item.is_checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Completed Section */}
            {completedTasks.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <button
                  onClick={() => setCompletedOpen(!completedOpen)}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 mb-3 w-full"
                >
                  <span>{completedOpen ? '▾' : '▸'}</span>
                  <span>Completed ({completedTasks.length})</span>
                </button>

                {completedOpen && (
                  <div className="space-y-3 opacity-60">
                    {completedTasks.map(task => (
                      <div key={task.id} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="font-semibold text-gray-500 text-sm line-through">{task.title}</p>
                          {canManageTask(task) && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleOpenEdit(task)}
                                className="text-gray-300 hover:text-[#004B93] transition"
                                aria-label="Edit task"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => handleDelete(task.id)}
                                className="text-gray-300 hover:text-red-400 text-lg leading-none"
                              >×</button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          {task.task_items.map(item => (
                            <label key={item.id} className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.is_checked}
                                onChange={() => handleCheck(task.id, item.id, item.is_checked)}
                                className="w-4 h-4 rounded accent-teal-500"
                              />
                              <span className="text-sm line-through text-gray-400">{item.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}