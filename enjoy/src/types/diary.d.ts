type DiaryType = {
  id: string;
  title: string;
  content: string;
  config: Record<string, any>;
  ttsConfig: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
};
