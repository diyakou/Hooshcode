import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { FolderOpen, Plus, FileText, Upload } from 'lucide-react';
import { createSkillSource } from '../../acp/sources';
import { toast } from 'react-toastify';

interface AddSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSkillAdded: () => void;
}

export function AddSkillDialog({ open, onOpenChange, onSkillAdded }: AddSkillDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenSkillsFolder = async () => {
    try {
      const isWin = window.electron.platform === 'win32';
      const homePath = isWin
        ? (window.appConfig.get('USERPROFILE') as string) || 'C:\\Users\\Administrator'
        : (window.appConfig.get('HOME') as string) || '/root';
      const separator = isWin ? '\\' : '/';
      const skillsDir = `${homePath}${separator}.agents${separator}skills`;

      await window.electron.ensureDirectory(skillsDir);
      await window.electron.openDirectoryInExplorer(skillsDir);
    } catch (err) {
      console.error('Failed to open skills directory:', err);
    }
  };

  const handleImportFile = async () => {
    try {
      const selected = await window.electron.selectFileOrDirectory();
      if (!selected) return;

      const fileRes = await window.electron.selectImportSessionFile();
      if (fileRes && fileRes.contents) {
        setContent(fileRes.contents);
        if (!name && fileRes.filePath) {
          const baseName = fileRes.filePath.split(/[\\/]/).pop()?.replace(/\.md$/i, '') || '';
          setName(baseName.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
        }
      }
    } catch (err) {
      toast.error(`Import Failed: ${String(err)}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
    if (!cleanName) {
      toast.error('Please provide a valid skill name (letters, numbers, hyphens)');
      return;
    }
    if (!description.trim()) {
      toast.error('Please provide a description for the skill');
      return;
    }
    if (!content.trim()) {
      toast.error('Please provide skill instructions (Markdown content)');
      return;
    }

    try {
      setIsSubmitting(true);
      await createSkillSource(cleanName, description.trim(), content.trim());
      toast.success(`Skill "${cleanName}" created successfully!`);
      setName('');
      setDescription('');
      setContent('');
      onOpenChange(false);
      onSkillAdded();
    } catch (err) {
      toast.error(`Failed to create skill: ${String(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-xl font-medium">
              <Plus className="w-5 h-5 text-text-primary" />
              Add Custom Skill (افزودن مهارت جدید)
            </DialogTitle>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Create a custom skill or open your local skills folder to drop in pre-made skills.
          </p>
        </DialogHeader>

        <div className="flex gap-2 my-3 p-2 bg-background-secondary rounded-lg border border-border-primary">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1 flex items-center gap-2"
            onClick={handleOpenSkillsFolder}
          >
            <FolderOpen className="w-4 h-4" />
            Open Skills Folder (پوشه مهارت‌ها)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 flex items-center gap-2"
            onClick={handleImportFile}
          >
            <Upload className="w-4 h-4" />
            Import SKILL.md (بارگذاری فایل)
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-text-primary mb-1 block">
              Skill Name (نام مهارت - حروف کوچک و خط تیره)
            </label>
            <Input
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
              }
              placeholder="e.g. photoshop-helper or video-editor"
              required
              className="font-mono text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-primary mb-1 block">
              Description (توضیحات مهارت)
            </label>
            <Input
              value={description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
              placeholder="What this skill helps with (e.g. Automates Adobe Photoshop photo edits)"
              required
              className="text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-primary mb-1 block">
              Instructions & Guidelines (دستورالعمل‌ها و پرامپت مهارت - Markdown)
            </label>
            <textarea
              value={content}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
              placeholder={`# Skill Instructions\n\nWhen asked to edit photos or videos:\n1. Use computer_control to capture the screen\n2. Locate the tool or send hotkeys\n...`}
              rows={8}
              required
              className="w-full rounded-md border border-border-primary bg-background-primary px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <DialogFooter className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {isSubmitting ? 'Creating...' : 'Create Skill (ذخیره مهارت)'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export default AddSkillDialog;
