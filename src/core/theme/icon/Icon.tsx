import { FunctionComponent, SVGProps } from 'react';

interface IconProps {
  className?: string;
  height?: number;
  icon: FunctionComponent<SVGProps<SVGSVGElement>>;
  onClick?: () => void;
  width?: number;
}

const Icon = ({ icon, height = 18, className, onClick, width = 18 }: IconProps): JSX.Element => {
  const IconComponent = icon;
  return <IconComponent height={height} className={className} width={width} onClick={() => onClick?.()} />;
};

export default Icon;
