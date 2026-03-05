declare global {
  interface Window {
    gapi: {
      load: (name: string, callback: () => void) => void;
    };
    google: {
      picker: {
        Action: {
          PICKED: string;
          CANCEL: string;
        };
        DocsView: new (viewId: string) => {
          setIncludeFolders: (enabled: boolean) => void;
          setSelectFolderEnabled: (enabled: boolean) => void;
        };
        ViewId: {
          FOLDERS: string;
        };
        PickerBuilder: new () => {
          setDeveloperKey: (key: string) => any;
          setOAuthToken: (token: string) => any;
          addView: (view: unknown) => any;
          setCallback: (callback: (data: any) => void) => any;
          build: () => { setVisible: (visible: boolean) => void };
        };
      };
    };
  }
}

export {};
