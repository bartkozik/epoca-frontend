import { ReactNode } from 'react';

interface MainContentProps {
  children: ReactNode;
  className?: string;
}

function MainContent({ children, className }: MainContentProps): JSX.Element {
  return (
    <div className="container">
      <div className={className}>{children}</div>
    </div>
  );
}

export default MainContent;
