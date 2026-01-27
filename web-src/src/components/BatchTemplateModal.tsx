import { useState, useEffect } from 'react';
import { X, FolderOpen, FileSpreadsheet, Loader2, Check, ChevronRight, Image, Film, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BatchTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// 任务类型选项（排除文生视频）
const TASK_TYPES = [
  { id: 'Create Image', label: '文生图片', icon: Image, description: '根据图片生成新图片' },
  { id: 'Frames to Video', label: '首尾帧视频', icon: Film, description: '根据首尾帧生成视频' },
  { id: 'Ingredients to Video', label: '图生视频', icon: Sparkles, description: '根据图片素材生成视频' },
];

// 分辨率选项
const RESOLUTIONS: Record<string, string[]> = {
  'Create Image': ['1K', '2K', '4K'],
  'Frames to Video': ['720p', '1080p'],
  'Ingredients to Video': ['720p', '1080p'],
};

export function BatchTemplateModal({ isOpen, onClose }: BatchTemplateModalProps) {
  const [step, setStep] = useState(1);
  const [folderPath, setFolderPath] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [taskType, setTaskType] = useState('Create Image');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('9:16');
  const [resolution, setResolution] = useState('1K');
  const [outputDir, setOutputDir] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const api = typeof window !== 'undefined' ? window.pywebview?.api : null;

  // 重置状态
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setFolderPath('');
      setImages([]);
      setTaskType('Create Image');
      setAspectRatio('9:16');
      setResolution('1K');
      setOutputDir('');
      setDefaultPrompt('');
      setLoading(false);
      setGenerating(false);
    }
  }, [isOpen]);

  // 当任务类型变化时，更新分辨率
  useEffect(() => {
    const availableResolutions = RESOLUTIONS[taskType] || ['720p', '1080p'];
    
    if (!availableResolutions.includes(resolution)) {
      // 默认选择较低分辨率：图片选 1K，视频选 720p
      setResolution(availableResolutions[0]);
    }
  }, [taskType]);

  // 选择文件夹
  const handleSelectFolder = async () => {
    if (!api || loading) return;
    
    setLoading(true);
    try {
      const result = await (api as any).select_image_folder();
      if (result.success) {
        setFolderPath(result.folder_path);
        setImages(result.images);
        if (result.images.length > 0) {
          setStep(2);
        }
      } else if (result.error) {
        alert(result.error);
      }
    } catch (e) {
      console.error('选择文件夹失败:', e);
    } finally {
      setLoading(false);
    }
  };

  // 生成模板
  const handleGenerate = async () => {
    if (!api || generating || images.length === 0) return;

    setGenerating(true);
    try {
      const result = await (api as any).create_custom_template(
        images,
        taskType,
        aspectRatio,
        resolution,
        outputDir,
        defaultPrompt
      );
      
      if (result.success) {
        alert(`模板创建成功！包含 ${result.count} 个任务`);
        onClose();
      } else {
        alert(result.error || '创建失败');
      }
    } catch (e) {
      console.error('创建模板失败:', e);
      alert('创建模板失败');
    } finally {
      setGenerating(false);
    }
  };

  // 获取当前可用的分辨率选项
  const availableResolutions = RESOLUTIONS[taskType] || ['720p', '1080p'];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-zinc-100">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">创建简单模板</h2>
              <p className="text-sm text-zinc-500 mt-0.5">
                步骤 {step}/3：{step === 1 ? '选择图片文件夹' : step === 2 ? '配置任务参数' : '确认生成'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-100 transition-colors"
            >
              <X className="w-5 h-5 text-zinc-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 min-h-[320px]">
            <AnimatePresence mode="wait">
              {/* Step 1: Select Folder */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-4"
                >
                  <div
                    onClick={handleSelectFolder}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
                      loading ? 'border-violet-300 bg-violet-50' : 'border-zinc-200 hover:border-violet-300'
                    }`}
                  >
                    <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
                      loading ? 'bg-violet-100' : 'bg-zinc-100'
                    }`}>
                      {loading ? (
                        <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
                      ) : (
                        <FolderOpen className="w-8 h-8 text-zinc-400" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-zinc-700 mb-1">
                      {loading ? '正在扫描...' : '点击选择图片文件夹'}
                    </p>
                    <p className="text-xs text-zinc-400">
                      支持 .jpg, .jpeg, .png, .webp 格式
                    </p>
                  </div>

                  {folderPath && images.length === 0 && (
                    <div className="bg-orange-50 text-orange-600 p-4 rounded-xl text-sm">
                      选择的文件夹中没有找到图片文件
                    </div>
                  )}

                  {images.length > 0 && (
                    <div className="bg-emerald-50 text-emerald-600 p-4 rounded-xl text-sm flex items-center justify-between">
                      <span>已扫描到 {images.length} 张图片</span>
                      <Check className="w-5 h-5" />
                    </div>
                  )}
                </motion.div>
              )}

              {/* Step 2: Configure Parameters */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5"
                >
                  {/* Task Type */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">任务类型</label>
                    <div className="space-y-2">
                      {TASK_TYPES.map((type) => {
                        const Icon = type.icon;
                        return (
                          <button
                            key={type.id}
                            onClick={() => setTaskType(type.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                              taskType === type.id
                                ? 'border-violet-500 bg-violet-50'
                                : 'border-zinc-200 hover:border-zinc-300'
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              taskType === type.id ? 'bg-violet-100' : 'bg-zinc-100'
                            }`}>
                              <Icon className={`w-5 h-5 ${
                                taskType === type.id ? 'text-violet-600' : 'text-zinc-400'
                              }`} />
                            </div>
                            <div className="flex-1 text-left">
                              <p className={`text-sm font-medium ${
                                taskType === type.id ? 'text-violet-700' : 'text-zinc-700'
                              }`}>
                                {type.label}
                              </p>
                              <p className="text-xs text-zinc-400">{type.description}</p>
                            </div>
                            {taskType === type.id && (
                              <Check className="w-5 h-5 text-violet-500" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Aspect Ratio & Resolution */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-2">屏幕方向</label>
                      <div className="flex bg-zinc-100 p-1 rounded-xl">
                        {(['16:9', '9:16'] as const).map((ratio) => (
                          <button
                            key={ratio}
                            onClick={() => setAspectRatio(ratio)}
                            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                              aspectRatio === ratio
                                ? 'bg-white shadow-sm text-zinc-900'
                                : 'text-zinc-500 hover:text-zinc-700'
                            }`}
                          >
                            {ratio === '16:9' ? '横屏' : '竖屏'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-2">分辨率</label>
                      <div className="flex bg-zinc-100 p-1 rounded-xl">
                        {availableResolutions.map((res) => (
                          <button
                            key={res}
                            onClick={() => setResolution(res)}
                            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                              resolution === res
                                ? 'bg-white shadow-sm text-zinc-900'
                                : 'text-zinc-500 hover:text-zinc-700'
                            }`}
                          >
                            {res}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Default Prompt */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      默认提示词 <span className="text-zinc-400 font-normal">(可选)</span>
                    </label>
                    <textarea
                      value={defaultPrompt}
                      onChange={(e) => setDefaultPrompt(e.target.value)}
                      placeholder="所有任务的默认提示词，可在模板中单独修改"
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100 resize-none"
                    />
                    <p className="text-xs text-amber-600 mt-1.5">
                      * 生成模板后请打开 Excel 文件，根据每张图片的内容修改对应的提示词
                    </p>
                  </div>

                  {/* Output Directory */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      输出文件夹名称 <span className="text-zinc-400 font-normal">(可选)</span>
                    </label>
                    <input
                      type="text"
                      value={outputDir}
                      onChange={(e) => setOutputDir(e.target.value)}
                      placeholder="留空则使用默认输出目录"
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                    />
                  </div>
                </motion.div>
              )}

              {/* Step 3: Confirm */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="bg-zinc-50 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-zinc-200">
                      <span className="text-sm text-zinc-500">图片数量</span>
                      <span className="text-sm font-medium text-zinc-900">{images.length} 张</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-zinc-200">
                      <span className="text-sm text-zinc-500">任务类型</span>
                      <span className="text-sm font-medium text-zinc-900">
                        {TASK_TYPES.find(t => t.id === taskType)?.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-zinc-200">
                      <span className="text-sm text-zinc-500">屏幕方向</span>
                      <span className="text-sm font-medium text-zinc-900">
                        {aspectRatio === '16:9' ? '横屏' : '竖屏'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-zinc-200">
                      <span className="text-sm text-zinc-500">分辨率</span>
                      <span className="text-sm font-medium text-zinc-900">{resolution}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-zinc-200">
                      <span className="text-sm text-zinc-500">默认提示词</span>
                      <span className="text-sm font-medium text-zinc-900 truncate max-w-[200px]">
                        {defaultPrompt || '(空)'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-zinc-500">输出文件夹</span>
                      <span className="text-sm font-medium text-zinc-900">
                        {outputDir || '默认目录'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-amber-50 text-amber-700 p-4 rounded-xl text-sm">
                    <p>将创建包含 {images.length} 行任务的 Excel 模板，每行对应一张图片。</p>
                    <p className="mt-1 font-medium">请打开模板文件，根据每张图片内容修改对应的提示词后再导入！</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-5 border-t border-zinc-100 bg-zinc-50">
            <button
              onClick={() => step > 1 ? setStep(step - 1) : onClose()}
              className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              {step > 1 ? '上一步' : '取消'}
            </button>

            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && images.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                下一步
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    生成模板
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
