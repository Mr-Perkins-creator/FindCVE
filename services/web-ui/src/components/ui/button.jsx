export function Button({ children, onClick, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-2xl shadow bg-green-600 text-white hover:bg-green-700 transition ${className}`}
    >
      {children}
    </button>
  )
}
