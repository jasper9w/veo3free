import { Loader2, AlertCircle, FileText, Key } from 'lucide-react';
import type { SystemInfo, UpdateInfo } from '../types';

interface UpdateStatusBarProps {
  systemInfo: SystemInfo | null;
  checkingUpdate: boolean;
  updateInfo: UpdateInfo | null;
  onCheckUpdate: () => void;
  onOpenLogs: () => void;
  onOpenApiVerify: () => void;
}

export function UpdateStatusBar({
  systemInfo,
  checkingUpdate,
  updateInfo,
  onCheckUpdate,
  onOpenLogs,
  onOpenApiVerify,
}: UpdateStatusBarProps) {
  if (!systemInfo) return null;

  // 判断是否有新版本
  const hasUpdate = updateInfo?.has_update && updateInfo.success;

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 text-xs py-1.5 px-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-4">
        <button
          onClick={onCheckUpdate}
          disabled={checkingUpdate}
          className={`flex items-center gap-1 transition-colors ${
            hasUpdate
              ? 'text-orange-500 hover:text-orange-600 font-medium'
              : 'hover:text-zinc-900'
          }`}
          title={hasUpdate ? '发现新版本，点击更新' : '点击检查更新'}
        >
          {checkingUpdate && <Loader2 className="w-3 h-3 animate-spin" />}
          {hasUpdate && <AlertCircle className="w-3 h-3" />}
          <span>
            {hasUpdate
              ? `v${systemInfo.version} → v${updateInfo.latest_version} (新版本)`
              : `v${systemInfo.version}`}
          </span>
        </button>
        <span className="select-text cursor-text">{systemInfo.userAgent}</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenApiVerify}
          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors"
          title="API 接入"
        >
          <Key className="w-3 h-3" />
          <span>API 接入</span>
        </button>
        <button
          onClick={onOpenLogs}
          className="flex items-center gap-1 text-violet-600 hover:text-violet-700 transition-colors"
          title="打开日志目录"
        >
          <FileText className="w-3 h-3" />
          <span>调试日志</span>
        </button>
      </div>
    </footer>
  );
}
