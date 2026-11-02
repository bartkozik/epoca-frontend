export type ClientAndProjectOptionData = {
  clientName: string;
  colorBallBackground: { backgroundColor: string };
  projectName: string;
  title?: string;
};

export type ClientAndProjectOption = {
  clientColor?: string;
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  title?: string;
  type?: 'recent' | 'normal';
};
