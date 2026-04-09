export interface AppleScriptResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface CreateNoteParams {
  title: string;
  content: string;
  tags?: string[];
  folder?: string;
}

export interface SearchParams {
  query: string;
}

export interface GetNoteParams {
  title: string;
}
