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

export interface SystemInfo {
  version: string;
  userAgent: string;
}

export interface UpdateInfo {
  success: boolean;
  has_update: boolean;
  current_version: string;
  latest_version: string;
  release_notes: string;
  download_url: string;
  release_url: string;
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
  get_app_version: () => Promise<string>;
  check_update: () => Promise<UpdateInfo>;
  open_update_page: (url: string) => Promise<boolean>;
  open_guide_page: () => Promise<void>;
  open_logs_dir: () => Promise<void>;
  retry_task: (task_index: number) => Promise<{ success: boolean; error?: string }>;
  retry_all_failed: () => Promise<{ success: boolean; count?: number; error?: string }>;
}

declare global {
  interface Window {
    pywebview?: {
      api: PyWebViewApi;
    };
  }
}
