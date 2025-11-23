import './ResizeHandle.css'

interface ResizeHandleProps {
  handleIndex: number
  onMouseDown: (handleIndex: number, e: React.MouseEvent) => void
}

function ResizeHandle({ handleIndex, onMouseDown }: ResizeHandleProps) {
  return (
    <div
      className="resize-handle"
      onMouseDown={(e) => onMouseDown(handleIndex, e)}
    />
  )
}

export default ResizeHandle

