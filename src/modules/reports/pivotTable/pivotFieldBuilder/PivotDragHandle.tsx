function PivotDragHandle(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      data-testid="pivot-drag-dots"
      fill="currentColor"
      height="16"
      viewBox="0 0 10 16"
      width="10"
    >
      {[2, 8].flatMap((x) => [2, 8, 14].map((y) => <circle cx={x} cy={y} key={`${x}-${y}`} r="1.5" />))}
    </svg>
  );
}

export default PivotDragHandle;
