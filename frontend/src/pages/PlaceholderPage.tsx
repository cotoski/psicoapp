export function PlaceholderPage({ title, task }: { title: string; task: string }) {
  return (
    <div>
      <h1 className="section-title">{title}</h1>
      <p className="empty-state">Em construção — {task}.</p>
    </div>
  )
}
