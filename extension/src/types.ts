export type PaperData = {
  title: string;
  abstract: string;
  authors: string[];
  doi?: string;
  url: string;
};

export type RecentDoc = {
  id: string;
  documentId: string;
  documentUrl: string;
  title: string;
  folderId: string | null;
  createdAt: string;
};

export type ExtensionChatPayload = {
  paperData: PaperData;
  targetDocId: string;
  neuroMode: boolean;
};
