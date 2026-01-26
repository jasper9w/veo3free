import { useState, useEffect } from 'react';
import { X, Key, CheckCircle, AlertCircle, ExternalLink, Copy, Loader2, Info } from 'lucide-react';
import { motion } from 'framer-motion';

interface ApiVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (card: string) => Promise<{ success: boolean; error?: string; token?: string; api_key?: string; docs_url?: string }>;
  initialStatus?: { verified: boolean; api_key?: string; docs_url?: string };
}

export function ApiVerifyModal({
  isOpen,
  onClose,
  onVerify,
  initialStatus,
}: ApiVerifyModalProps) {
  const [card, setCard] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string; token?: string; api_key?: string; docs_url?: string } | null>(null);

  // 当 initialStatus 变化或弹窗打开时，更新 result
  useEffect(() => {
    if (isOpen && initialStatus?.verified) {
      setResult({ success: true, api_key: initialStatus.api_key, docs_url: initialStatus.docs_url });
    }
  }, [isOpen, initialStatus]);

  if (!isOpen) return null;

  const handleVerify = async () => {
    if (!card.trim()) return;
    setVerifying(true);
    setResult(null);
    try {
      const res = await onVerify(card.trim());
      setResult(res);
    } catch (error) {
      setResult({ success: false, error: error instanceof Error ? error.message : '验证失败' });
    } finally {
      setVerifying(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleOpenDocs = (url: string) => {
    window.open(url, '_blank');
  };

  const handleReset = () => {
    setShowInput(false);
    setResult(null);
    setCard('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
              <Key className="w-5 h-5 text-violet-600" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900">API 接入</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {!showInput && !result ? (
          <>
            <div className="mb-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-2">高级功能说明</p>
                  <p className="text-amber-700 leading-relaxed">
                    此功能为高级开发者功能，与绝大多数用户无关。如您确实需要了解其用途或有接入需求，请加入用户群沟通获取更多信息。
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 px-4 bg-zinc-100 text-zinc-700 rounded-xl text-sm font-medium hover:bg-zinc-200 transition-colors"
              >
                我知道了
              </button>
              <button
                onClick={() => setShowInput(true)}
                className="flex-1 py-3 px-4 bg-violet-500 text-white rounded-xl text-sm font-medium hover:bg-violet-600 transition-colors"
              >
                我已了解，继续
              </button>
            </div>
          </>
        ) : !result ? (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                请输入授权密钥
              </label>
              <input
                type="text"
                value={card}
                onChange={(e) => setCard(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !verifying && handleVerify()}
                placeholder="输入密钥"
                className="w-full px-4 py-2.5 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                disabled={verifying}
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="flex-1 py-3 px-4 bg-zinc-100 text-zinc-700 rounded-xl text-sm font-medium hover:bg-zinc-200 transition-colors"
                disabled={verifying}
              >
                返回
              </button>
              <button
                onClick={handleVerify}
                disabled={verifying || !card.trim()}
                className="flex-1 py-3 px-4 bg-violet-500 text-white rounded-xl text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
                验证
              </button>
            </div>
          </>
        ) : result.success ? (
          <>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3 p-3 bg-emerald-50 rounded-xl">
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <span className="text-sm text-emerald-700 font-medium">验证成功</span>
              </div>

              {result.api_key && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                    API Token
                  </label>
                  <div className="flex items-center gap-2 p-2.5 bg-zinc-50 rounded-lg border border-zinc-200">
                    <code className="flex-1 text-xs text-zinc-700 font-mono break-all">
                      {result.api_key}
                    </code>
                    <button
                      onClick={() => handleCopy(result.api_key!)}
                      className="p-1.5 hover:bg-zinc-200 rounded transition-colors"
                      title="复制"
                    >
                      <Copy className="w-4 h-4 text-zinc-500" />
                    </button>
                  </div>
                </div>
              )}

              {result.docs_url && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                    API 文档
                  </label>
                  <button
                    onClick={() => handleOpenDocs(result.docs_url!)}
                    className="w-full flex items-center justify-between p-2.5 bg-violet-50 hover:bg-violet-100 rounded-lg border border-violet-200 transition-colors group"
                  >
                    <span className="text-sm text-violet-700 font-medium">
                      {result.docs_url}
                    </span>
                    <ExternalLink className="w-4 h-4 text-violet-600 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 px-4 bg-violet-500 text-white rounded-xl text-sm font-medium hover:bg-violet-600 transition-colors"
            >
              关闭
            </button>
          </>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3 p-3 bg-red-50 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <span className="text-sm text-red-700 font-medium">
                  {result.error || '验证失败'}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="flex-1 py-3 px-4 bg-zinc-100 text-zinc-700 rounded-xl text-sm font-medium hover:bg-zinc-200 transition-colors"
              >
                重试
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 px-4 bg-violet-500 text-white rounded-xl text-sm font-medium hover:bg-violet-600 transition-colors"
              >
                关闭
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
