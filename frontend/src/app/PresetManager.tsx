"use client";

import { useState, useEffect, useCallback } from "react";

const API_BASE = "http://localhost:8001";

interface Preset {
  id: number;
  name: string;
  description: string;
  system_prompt: string;
  user_prompt: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

interface PresetManagerProps {
  open: boolean;
  onClose: () => void;
  onPresetsChanged?: () => void; // notify parent to refresh preset list
}

export default function PresetManager({ open, onClose, onPresetsChanged }: PresetManagerProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSystem, setEditSystem] = useState("");
  const [editUser, setEditUser] = useState("");
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create mode
  const [creating, setCreating] = useState(false);

  const fetchPresets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/presets`);
      if (!res.ok) return;
      const data: Preset[] = await res.json();
      if (!Array.isArray(data)) return;
      setPresets(data);
    } catch {
      setMessage({ type: "err", text: "加载预设失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      fetchPresets();
      setEditingId(null);
      setCreating(false);
      setMessage(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, fetchPresets]);

  const startCreate = () => {
    setCreating(true);
    setEditingId(null);
    setEditName("");
    setEditDesc("");
    setEditSystem("");
    setEditUser("");
    setEditIsDefault(false);
  };

  const startEdit = (p: Preset) => {
    setCreating(false);
    setEditingId(p.id);
    setEditName(p.name);
    setEditDesc(p.description);
    setEditSystem(p.system_prompt);
    setEditUser(p.user_prompt);
    setEditIsDefault(p.is_default);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCreating(false);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      setMessage({ type: "err", text: "预设名称不能为空" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (creating) {
        const res = await fetch(`${API_BASE}/api/presets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName,
            description: editDesc,
            system_prompt: editSystem,
            user_prompt: editUser,
            is_default: editIsDefault,
          }),
        });
        if (!res.ok) throw new Error("create failed");
        setMessage({ type: "ok", text: "预设创建成功" });
      } else {
        const res = await fetch(`${API_BASE}/api/presets/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName,
            description: editDesc,
            system_prompt: editSystem,
            user_prompt: editUser,
            is_default: editIsDefault,
          }),
        });
        if (!res.ok) throw new Error("update failed");
        setMessage({ type: "ok", text: "预设更新成功" });
      }
      setEditingId(null);
      setCreating(false);
      await fetchPresets();
      onPresetsChanged?.();
    } catch {
      setMessage({ type: "err", text: "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此预设吗？")) return;
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/presets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "err", text: data.detail || data.error || "删除失败" });
        return;
      }
      setMessage({ type: "ok", text: "预设已删除" });
      await fetchPresets();
      onPresetsChanged?.();
    } catch {
      setMessage({ type: "err", text: "删除失败" });
    }
  };

  const handleSetDefault = async (id: number) => {
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/presets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) throw new Error("failed");
      setMessage({ type: "ok", text: "已设为默认预设" });
      await fetchPresets();
      onPresetsChanged?.();
    } catch {
      setMessage({ type: "err", text: "设置失败" });
    }
  };

  if (!open) return null;

  const isEditing = editingId !== null || creating;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div
        className="drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-manager-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <div>
            <h2 id="preset-manager-title" className="text-lg font-semibold">预设管理</h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              管理文章风格，可在添加素材或重新生成文章时选择
            </p>
          </div>
          <button onClick={onClose} className="icon-button" aria-label="关闭预设管理">
            <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mx-6 mt-3 px-4 py-2 rounded-lg text-sm ${
            message.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}>
            {message.text}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-center py-12 text-zinc-400">加载中...</div>
          ) : isEditing ? (
            /* Edit / Create form */
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={cancelEdit} className="text-sm text-zinc-500 hover:text-zinc-800">
                  ← 返回列表
                </button>
                <span className="text-sm font-medium text-zinc-700">
                  {creating ? "新建预设" : `编辑: ${editName}`}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">预设名称 *</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="control-field"
                    placeholder="如: 默认、简洁风格、学术风格"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">描述</label>
                  <input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="control-field"
                    placeholder="预设用途说明"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">系统提示词 (System Prompt)</label>
                <textarea
                  value={editSystem}
                  onChange={(e) => setEditSystem(e.target.value)}
                  className="control-field h-40 py-3 font-mono text-sm resize-y"
                  spellCheck={false}
                  placeholder="定义写作角色和输出要求..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  用户提示词 (User Prompt)
                  <span className="font-normal text-zinc-400 ml-2">
                    支持变量: {"{transcript}"}, {"{chapter_titles}"}, {"{knowledge_str}"}
                  </span>
                </label>
                <textarea
                  value={editUser}
                  onChange={(e) => setEditUser(e.target.value)}
                  className="control-field h-40 py-3 font-mono text-sm resize-y"
                  spellCheck={false}
                  placeholder="用户消息模板，包含数据标签..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is-default"
                  checked={editIsDefault}
                  onChange={(e) => setEditIsDefault(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="is-default" className="text-sm text-zinc-700">设为默认预设</label>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
                <button
                  onClick={cancelEdit}
                  className="btn-secondary"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            /* Preset list */
            <div className="space-y-3">
              <div className="flex justify-end mb-2">
                <button
                  onClick={startCreate}
                  className="btn-primary"
                >
                  + 新建预设
                </button>
              </div>

              {presets.length === 0 ? (
                <div className="text-center py-12 text-zinc-400">暂无预设</div>
              ) : (
                presets.map((p) => (
                  <div key={p.id} className="surface-card p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-800">{p.name}</span>
                          {p.is_default && (
                            <span className="text-xs font-medium text-blue-700">默认</span>
                          )}
                        </div>
                        {p.description && (
                          <p className="text-sm text-zinc-500 mt-1">{p.description}</p>
                        )}
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2 font-mono">
                          {p.system_prompt.slice(0, 120)}...
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4 shrink-0">
                        <button
                          onClick={() => startEdit(p)}
                          className="btn-ghost min-h-8 px-3 text-xs"
                        >
                          编辑
                        </button>
                        {!p.is_default && (
                          <button
                            onClick={() => handleSetDefault(p.id)}
                            className="btn-ghost min-h-8 px-3 text-xs"
                          >
                            设为默认
                          </button>
                        )}
                        {!p.is_default && (
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="btn-danger min-h-8 px-3 text-xs"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
          用户提示词中的 {"{transcript}"}, {"{chapter_titles}"}, {"{knowledge_str}"} 为运行时自动替换的变量。
          XML 标签 {"<transcript>"}, {"<chapters>"}, {"<knowledge>"} 用于防注入，建议保留。
        </div>
      </div>
    </div>
  );
}
