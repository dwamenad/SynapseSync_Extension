export type PaperData = {
  title: string;
  abstract: string;
  methods?: string;
  figures?: string;
  discussion?: string;
  conclusions?: string;
  futureDirections?: string;
  citations?: string;
  authors?: string[];
  doi?: string;
  sourceType?: "pubmed" | "arxiv" | "biorxiv" | "journal";
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
