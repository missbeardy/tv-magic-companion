interface Assignee {
  id: string
  full_name: string
  avatar_url?: string | null
}

interface Props {
  assignees: Assignee[]
  maxVisible?: number
}

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

export default function LeadAssigneeAvatars({ assignees, maxVisible = 3 }: Props) {
  if (assignees.length === 0) return null

  const visible = assignees.slice(0, maxVisible)
  const overflow = assignees.length - visible.length

  return (
    <div className="flex items-center">
      {visible.map((person, index) => (
        <div
          key={person.id}
          className="w-6 h-6 rounded-full border-2 border-white bg-brand overflow-hidden shrink-0 flex items-center justify-center"
          style={{ marginLeft: index === 0 ? 0 : -6, zIndex: visible.length - index }}
          title={person.full_name}
        >
          {person.avatar_url ? (
            <img
              src={person.avatar_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[10px] font-medium text-white">
              {initials(person.full_name)}
            </span>
          )}
        </div>
      ))}
      {overflow > 0 && (
        <span
          className="ml-1 text-xs text-gray-500 font-medium"
          style={{ marginLeft: visible.length > 0 ? 2 : 0 }}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
