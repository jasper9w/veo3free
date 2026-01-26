import { useState, useEffect, useMemo } from 'react';
import { Play, Square, FolderOpen, FileSpreadsheet, X, Image, Film, Sparkles, Check, Loader2, Clock, AlertCircle, Plus, ChevronDown, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UpdateModal } from './components/UpdateModal';
import { UpdateStatusBar } from './components/UpdateStatusBar';
import { ApiVerifyModal } from './components/ApiVerifyModal';
import type { SystemInfo, UpdateInfo } from './types';

interface Task {
  id: string;
  prompt: string;
  status: string;
  status_detail?: string;
  task_type: string;
  aspect_ratio: string;
  resolution: string;
  saved_path?: string;
  output_dir?: string;
  start_time?: string;
  end_time?: string;
  file_ext?: string;
  preview_base64?: string;
}

interface Status {
  client_count: number;
  busy_count: number;
  is_running: boolean;
  tasks: Task[];
}

const TASK_TYPES = [
  { id: 'Create Image', label: '生成图片', icon: Image, color: 'violet' },
  { id: 'Text to Video', label: '文生视频', icon: Film, color: 'blue' },
  { id: 'Frames to Video', label: '首尾帧', icon: Sparkles, color: 'amber' },
  { id: 'Ingredients to Video', label: '图生视频', icon: Sparkles, color: 'emerald' },
];

const ASPECT_RATIOS = ['16:9', '9:16'];

function formatDuration(startTime?: string, endTime?: string): string {
  if (!startTime) return '';
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);

  if (seconds < 60) {
    return `${seconds}秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}分${remainingSeconds}秒`;
}

interface TaskCardProps {
  task: Task;
  index: number;
  onRetry?: (index: number) => void;
}

function TaskCard({ task, index, onRetry }: TaskCardProps) {
  const [, setTick] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const statusConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; text: string; label: string; animate?: boolean }> = {
    '已完成': { icon: Check, color: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-600', label: '已完成' },
    '处理中': { icon: Loader2, color: 'blue', bg: 'bg-blue-50', text: 'text-blue-600', label: task.status_detail || '处理中', animate: true },
    '等待中': { icon: Clock, color: 'zinc', bg: 'bg-zinc-100', text: 'text-zinc-500', label: '排队中' },
    '失败': { icon: AlertCircle, color: 'red', bg: 'bg-red-50', text: 'text-red-500', label: task.status_detail || '失败' },
    '超时': { icon: AlertCircle, color: 'orange', bg: 'bg-orange-50', text: 'text-orange-500', label: '超时' },
  };

  // 处理中时每秒更新一次，刷新运行时间（只更新当前任务的 tick）
  useEffect(() => {
    if (task.status !== '处理中' || !task.start_time) return;
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [task.status, task.start_time]);

  const config = statusConfig[task.status] || statusConfig['等待中'];
  const typeInfo = TASK_TYPES.find(t => t.id === task.task_type);
  const StatusIcon = config.icon;
  const duration = formatDuration(task.start_time, task.end_time);

  // 判断是否是图片或视频
  const isImage = task.file_ext === '.png' || task.file_ext === '.jpg';
  const isVideo = task.file_ext === '.mp4';
  const hasPreview = task.status === '已完成' && task.saved_path;
  const canRetry = ['失败', '超时', '下载失败'].includes(task.status);

  // 点击打开文件
  const handleClick = async () => {
    if (hasPreview && typeof window !== 'undefined' && window.pywebview?.api) {
      (window.pywebview.api as any).open_task_file(index);
    }
  };

  // 重试任务
  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (retrying || !onRetry) return;
    setRetrying(true);
    try {
      await onRetry(index);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className={`group bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 border border-zinc-100 ${hasPreview ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-start gap-4">
        {/* Status Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.bg}`}>
          <StatusIcon className={`w-5 h-5 ${config.text} ${config.animate ? 'animate-spin' : ''}`} />
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-600">
              {typeInfo?.label || task.task_type}
            </span>
            <span className="text-xs text-zinc-400">{task.aspect_ratio} · {task.resolution}</span>
            {duration && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${task.status === '处理中' ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-500'}`}>
                ⏱ {duration}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-700 line-clamp-2 leading-relaxed">{task.prompt}</p>
          {task.status_detail && (
            <p className={`text-xs mt-1 ${task.status === '失败' ? 'text-red-500' : 'text-blue-500'}`}>
              {task.status_detail}
            </p>
          )}
          {task.saved_path && (
            <p className="text-xs text-zinc-400 mt-2 flex items-center gap-1 truncate">
              <FolderOpen className="w-3 h-3 flex-shrink-0" />
              {task.saved_path}
            </p>
          )}
        </div>

        {/* Retry Button for failed tasks */}
        {canRetry && onRetry && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-orange-50 hover:bg-orange-100 transition-colors disabled:opacity-50"
            title="重试"
          >
            <RotateCw className={`w-5 h-5 text-orange-600 ${retrying ? 'animate-spin' : ''}`} />
          </button>
        )}

        {/* Preview Thumbnail on the right */}
        {hasPreview && (
          <div className="w-20 h-20 rounded-lg overflow-hidden border border-zinc-200 bg-zinc-100 flex-shrink-0 relative">
            {isImage && task.preview_base64 && (
              <img
                src={`data:image/png;base64,${task.preview_base64}`}
                alt="preview"
                className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
              />
            )}
            {isVideo && task.saved_path && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                <Film className="w-5 h-5 text-zinc-500" />
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('create');
  const [prompt, setPrompt] = useState('');
  const [taskType, setTaskType] = useState('Create Image');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('1K');
  const [refImages, setRefImages] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ client_count: 0, busy_count: 0, is_running: false, tasks: [] });
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showApiVerifyModal, setShowApiVerifyModal] = useState(false);
  const [apiVerifyStatus, setApiVerifyStatus] = useState<{ verified: boolean; api_key?: string; docs_url?: string } | null>(null);

  const api = typeof window !== 'undefined' ? window.pywebview?.api : null;

  // 视频类任务竖屏时只支持720p
  const resolutions = taskType === 'Create Image'
    ? ['1K', '2K', '4K']
    : (aspectRatio === '9:16' ? ['720p'] : ['720p', '1080p']);

  // 缓存任务统计，避免每次都重新计算
  const { completed, processing, failed, progress } = useMemo(() => {
    const comp = status.tasks.filter(t => t.status === '已完成').length;
    const proc = status.tasks.filter(t => t.status === '处理中').length;
    const fail = status.tasks.filter(t => ['失败', '超时', '下载失败'].includes(t.status)).length;
    return {
      completed: comp,
      processing: proc,
      failed: fail,
      progress: status.tasks.length ? (comp / status.tasks.length) * 100 : 0
    };
  }, [status.tasks]);

  // 重试单个任务
  const handleRetryTask = async (index: number) => {
    if (!api) return;
    try {
      await api.retry_task(index);
    } catch (e) {
      console.error('重试任务失败:', e);
    }
  };

  // 重试所有失败任务
  const handleRetryAllFailed = async () => {
    if (!api) return;
    try {
      await api.retry_all_failed();
    } catch (e) {
      console.error('重试所有失败任务失败:', e);
    }
  };

  const selectedType = TASK_TYPES.find(t => t.id === taskType);
  const TypeIcon = selectedType?.icon || Image;

  const maxRefImages = taskType === 'Frames to Video' ? 2 : taskType === 'Ingredients to Video' ? 3 : 8;
  const refImageLabel = taskType === 'Frames to Video' ? '首尾帧' : taskType === 'Ingredients to Video' ? '垫图' : '参考图';

  // 等待 API 就绪
  useEffect(() => {
    const check = () => {
      if (typeof window !== 'undefined' && window.pywebview?.api) {
        setReady(true);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  }, []);

  // 从后端获取版本号和 API 验证状态
  useEffect(() => {
    if (!ready || !api) return;
    const fetchData = async () => {
      try {
        const version = await api.get_app_version();
        setSystemInfo({
          version: version || 'dev',
          userAgent: navigator.userAgent,
        });
      } catch {
        setSystemInfo({
          version: 'dev',
          userAgent: navigator.userAgent,
        });
      }

      // 检查 API 验证状态
      try {
        const status = await (api as any).get_api_verify_status();
        setApiVerifyStatus(status);
      } catch {
        // 忽略错误
      }
    };
    fetchData();
  }, [ready, api]);

  // 轮询状态（固定延迟 1.5s）
  useEffect(() => {
    if (!ready || !api) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const result = await api.get_status();
        if (!cancelled) setStatus(result);
      } catch (e) {
        console.error('获取状态失败', e);
      }
      if (!cancelled) {
        setTimeout(poll, 1500);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [ready, api]);

  // 任务类型或比例变化时重置分辨率
  useEffect(() => {
    const currentResolutions = taskType === 'Create Image'
      ? ['1K', '2K', '4K']
      : (aspectRatio === '9:16' ? ['720p'] : ['720p', '1080p']);

    if (!currentResolutions.includes(resolution)) {
      setResolution(currentResolutions[currentResolutions.length - 1]);
    }
    if (taskType === 'Text to Video') {
      setRefImages([]);
    }
  }, [taskType, aspectRatio]);

  const addTask = async () => {
    if (!prompt.trim() || !ready || !api) return;
    await api.add_task(prompt.trim(), taskType, aspectRatio, resolution, refImages, '');
    setPrompt('');
    setRefImages([]);

    // 添加任务后自动开始执行
    setTimeout(() => {
      api.start_execution();
    }, 300);
  };

  const selectImages = async () => {
    if (!ready || !api || taskType === 'Text to Video') return;
    const imgs = await api.select_images();
    if (imgs && imgs.length) {
      setRefImages(prev => [...prev, ...imgs].slice(0, maxRefImages));
    }
  };

  const handleImportExcel = async () => {
    if (!ready || !api) return;
    const result = await api.import_excel();
    if (result) {
      if (result.success) {
        if (result.count > 0) {
          alert(`导入成功！添加了 ${result.count} 个任务`);
        } else {
          const errorMsg = result.errors && result.errors.length > 0
            ? `没有有效的任务被导入\n\n原因:\n${result.errors.slice(0, 3).join('\n')}${result.errors.length > 3 ? '\n...' : ''}`
            : '没有有效的任务被导入';
          alert(errorMsg);
        }
      } else {
        alert(`导入失败: ${result.errors?.[0] || '未知错误'}`);
      }
    }
  };

  const handleExportTemplate = async () => {
    if (!ready || !api) return;
    await api.export_template();
  };

  const handleStart = async () => {
    if (!ready || !api) return;
    await api.start_execution();
  };

  const handleStop = async () => {
    if (!ready || !api) return;
    await api.stop_execution();
  };

  const handleOpenOutputDir = async () => {
    if (!ready || !api) return;
    await api.open_output_dir();
  };

  const handleOpenLogsDir = async () => {
    if (!ready || !api) return;
    await api.open_logs_dir();
  };

  // 检查更新
  const checkForUpdate = async (showNoUpdate = false) => {
    if (!ready || !api || checkingUpdate) return;

    setCheckingUpdate(true);
    try {
      const result = await api.check_update();
      setUpdateInfo(result);

      if (result.success && result.has_update) {
        setShowUpdateModal(true);
      } else if (showNoUpdate && result.success) {
        alert('当前已是最新版本');
      } else if (!result.success && showNoUpdate) {
        alert('检查更新失败，请检查网络连接');
      }
    } catch {
      if (showNoUpdate) {
        alert('检查更新失败');
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  // 启动时自动检查更新
  useEffect(() => {
    if (ready && api) {
      const timer = setTimeout(() => {
        checkForUpdate(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [ready, api]);

  // 打开下载页面
  const handleOpenDownload = async () => {
    if (updateInfo && api) {
      await api.open_update_page(updateInfo.download_url || updateInfo.release_url);
      setShowUpdateModal(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-200/50">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-zinc-900">AI 创作工作台</h1>
                <p className="text-xs text-zinc-500">图片与视频生成</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 rounded-full">
                <div className={`w-2 h-2 rounded-full ${status.is_running ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-300'}`} />
                <span className="text-sm text-zinc-600">{status.is_running ? '运行中' : '空闲'}</span>
              </div>
              {status.client_count > 0 && (
                <div className="text-sm text-zinc-500 px-3 py-1.5 bg-zinc-100 rounded-full">
                  {status.client_count} 设备在线
                </div>
              )}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => api?.open_guide_page?.()}
                className={`flex items-center justify-center rounded-full transition-colors ${
                  status.client_count > 0
                    ? 'w-8 h-8 bg-zinc-100 hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600'
                    : 'px-3 py-1.5 bg-violet-500 text-white hover:bg-violet-600 text-sm font-medium'
                }`}
                title="添加设备连接"
              >
                {status.client_count > 0 ? (
                  <Plus className="w-4 h-4" />
                ) : (
                  '添加连接'
                )}
              </motion.button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left: Create Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tab Switcher */}
            <div className="flex bg-zinc-100 p-1 rounded-2xl">
              <button
                onClick={() => setActiveTab('create')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'create' 
                    ? 'bg-white shadow-sm text-zinc-900' 
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                创建任务
              </button>
              <button
                onClick={() => setActiveTab('batch')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'batch' 
                    ? 'bg-white shadow-sm text-zinc-900' 
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                批量导入
              </button>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'create' ? (
                <motion.div
                  key="create"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-5"
                >
                  {/* Task Type Selector */}
                  <div className="relative">
                    <button
                      onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                      className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-zinc-200 hover:border-zinc-300 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                          <TypeIcon className="w-5 h-5 text-violet-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-zinc-900">{selectedType?.label}</p>
                          <p className="text-xs text-zinc-500">{selectedType?.id}</p>
                        </div>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {showTypeDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-zinc-200 shadow-xl z-20 overflow-hidden"
                        >
                          {TASK_TYPES.map((type) => {
                            const Icon = type.icon;
                            return (
                              <button
                                key={type.id}
                                onClick={() => { setTaskType(type.id); setShowTypeDropdown(false); }}
                                className={`w-full flex items-center gap-3 p-4 hover:bg-zinc-50 transition-colors ${
                                  taskType === type.id ? 'bg-zinc-50' : ''
                                }`}
                              >
                                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                                  <Icon className="w-5 h-5 text-violet-600" />
                                </div>
                                <div className="text-left flex-1">
                                  <p className="text-sm font-medium text-zinc-900">{type.label}</p>
                                  <p className="text-xs text-zinc-500">{type.id}</p>
                                </div>
                                {taskType === type.id && (
                                  <Check className="w-5 h-5 text-emerald-500" />
                                )}
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Prompt Input */}
                  <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100 transition-all">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="描述你想创作的内容..."
                      className="w-full p-4 text-sm resize-none focus:outline-none h-32"
                    />

                    {/* Reference Images */}
                    {taskType !== 'Text to Video' && (
                      <div className="px-4 pb-4 border-t border-zinc-100 pt-3">
                        <p className="text-xs text-zinc-500 mb-2">{refImageLabel}（最多 {maxRefImages} 张）</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {refImages.map((img, i) => (
                            <div key={i} className="relative group">
                              <div className="w-14 h-14 rounded-xl bg-zinc-100 overflow-hidden border border-zinc-200">
                                <img
                                  src={`data:image/jpeg;base64,${img}`}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <button
                                onClick={() => setRefImages(refImages.filter((_, j) => j !== i))}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-900 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          {refImages.length < maxRefImages && (
                            <button
                              onClick={selectImages}
                              className="w-14 h-14 rounded-xl border-2 border-dashed border-zinc-200 flex items-center justify-center text-zinc-400 hover:border-violet-300 hover:text-violet-500 transition-colors"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Options */}
                  <div className="flex gap-3">
                    <div className="flex-1 bg-white rounded-xl border border-zinc-200 p-1">
                      <div className="flex">
                        {ASPECT_RATIOS.map((ratio) => (
                          <button
                            key={ratio}
                            onClick={() => setAspectRatio(ratio)}
                            className={`flex-1 py-2.5 text-xs font-medium rounded-lg transition-all ${
                              aspectRatio === ratio
                                ? 'bg-zinc-900 text-white'
                                : 'text-zinc-500 hover:text-zinc-700'
                            }`}
                          >
                            {ratio}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 bg-white rounded-xl border border-zinc-200 p-1">
                      <div className="flex">
                        {resolutions.map((res) => (
                          <button
                            key={res}
                            onClick={() => setResolution(res)}
                            className={`flex-1 py-2.5 text-xs font-medium rounded-lg transition-all ${
                              resolution === res
                                ? 'bg-zinc-900 text-white'
                                : 'text-zinc-500 hover:text-zinc-700'
                            }`}
                          >
                            {res}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={addTask}
                    disabled={!prompt.trim()}
                    className="w-full py-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-2xl font-medium shadow-lg shadow-violet-200 hover:shadow-xl hover:shadow-violet-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all"
                  >
                    添加到队列
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div
                  key="batch"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div
                    onClick={handleImportExcel}
                    className="bg-white rounded-2xl border-2 border-dashed border-zinc-200 p-8 text-center hover:border-violet-300 transition-colors cursor-pointer"
                  >
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-100 flex items-center justify-center">
                      <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                    </div>
                    <p className="text-sm font-medium text-zinc-700 mb-1">点击选择 Excel 文件</p>
                    <p className="text-xs text-zinc-400">支持 .xlsx 格式</p>
                  </div>
                  <button
                    onClick={handleExportTemplate}
                    className="w-full py-3 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-medium hover:bg-zinc-200 transition-colors"
                  >
                    下载模板文件
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Task Queue */}
          <div className="lg:col-span-3 space-y-4">
            {/* Queue Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-zinc-900">任务队列</h2>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded-full text-xs">{completed} 完成</span>
                  {processing > 0 && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full text-xs">{processing} 进行中</span>
                  )}
                  <span className="px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded-full text-xs">共 {status.tasks.length}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {status.is_running ? (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleStop}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium bg-zinc-900 text-white transition-all"
                  >
                    <Square className="w-4 h-4" />
                    停止
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleStart}
                    disabled={!status.tasks.length || !status.client_count}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium bg-emerald-500 text-white shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all"
                  >
                    <Play className="w-4 h-4" />
                    开始
                  </motion.button>
                )}
                <button
                  onClick={handleOpenOutputDir}
                  className="p-2.5 hover:bg-zinc-100 rounded-xl transition-colors border border-zinc-200"
                  title="打开输出目录"
                >
                  <FolderOpen className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            {status.tasks.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-zinc-600">总体进度</span>
                  <div className="flex items-center gap-3">
                    {failed > 0 && (
                      <button
                        onClick={handleRetryAllFailed}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        重试失败 ({failed})
                      </button>
                    )}
                    <span className="text-sm font-medium text-zinc-900">{completed} / {status.tasks.length}</span>
                  </div>
                </div>
                <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                  />
                </div>
              </div>
            )}

            {/* Task List */}
            <div className="space-y-3 max-h-96 lg:max-h-screen overflow-y-auto pr-1">
              <AnimatePresence>
                {status.tasks.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-white rounded-2xl p-12 text-center border border-zinc-100"
                  >
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-100 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-zinc-300" />
                    </div>
                    <p className="text-zinc-500">暂无任务</p>
                    <p className="text-sm text-zinc-400 mt-1">创建你的第一个生成任务</p>
                  </motion.div>
                ) : (
                  status.tasks.map((task, index) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      index={index}
                      onRetry={handleRetryTask}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>

      {/* Status Bar */}
      <UpdateStatusBar
        systemInfo={systemInfo}
        checkingUpdate={checkingUpdate}
        updateInfo={updateInfo}
        onCheckUpdate={() => checkForUpdate(true)}
        onOpenLogs={handleOpenLogsDir}
        onOpenApiVerify={() => setShowApiVerifyModal(true)}
      />

      {/* Update Modal */}
      <UpdateModal
        isOpen={showUpdateModal}
        updateInfo={updateInfo}
        onClose={() => setShowUpdateModal(false)}
        onDownload={handleOpenDownload}
      />

      {/* API Verify Modal */}
      <ApiVerifyModal
        isOpen={showApiVerifyModal}
        onClose={() => setShowApiVerifyModal(false)}
        initialStatus={apiVerifyStatus || undefined}
        onVerify={async (card: string) => {
          if (!api) {
            return { success: false, error: 'API 未就绪' };
          }
          try {
            const result = await (api as any).verify_pjy_card(card);
            if (result.success) {
              // 更新验证状态
              setApiVerifyStatus({
                verified: true,
                api_key: result.api_key,
                docs_url: result.docs_url,
              });
            }
            return result;
          } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '验证失败' };
          }
        }}
      />
    </div>
  );
}

export default App;