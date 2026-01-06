export interface Task {
  id: string;
  prompt: string;
  status: string;
  status_detail: string;
  task_type: string;
  aspect_ratio: string;
  resolution: string;
  saved_path?: string;
  output_dir?: string;
}

export interface Status {
  client_count: number;
  busy_count: number;
  is_running: boolean;
  tasks: Task[];
}

export interface PyWebViewApi {
  add_task: (
    prompt: string,
    task_type: string,
    aspect_ratio: string,
    resolution: string,
    reference_images: string[],
    output_dir: string
  ) => Promise<{ success: boolean; error?: string }>;
  get_status: () => Promise<Status>;
  start_execution: () => Promise<void>;
  stop_execution: () => Promise<void>;
  select_images: () => Promise<string[]>;
  import_excel: () => Promise<{ success: boolean; count: number; errors: string[] }>;
  export_template: () => Promise<void>;
  open_output_dir: () => Promise<void>;
  open_task_dir: (task_index: number) => Promise<void>;
}

declare global {
  interface Window {
    pywebview?: {
      api: PyWebViewApi;
    };
  }
}
