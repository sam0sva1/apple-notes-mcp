export interface AppleScriptResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface NoteInfo {
  uuid: string;
  title: string;
  snippet: string;
  folder: string;
  account: string;
  createdAt: string;
  modifiedAt: string;
}
