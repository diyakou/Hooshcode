import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { FolderOpen, Plus } from 'lucide-react';
import { toast } from 'react-toastify';
const installSkill = (source: string) => window.electron.installSkill(source);

interface AddSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSkillAdded: () => void;
}

export function AddSkillDialog({ open, onOpenChange, onSkillAdded }: AddSkillDialogProps) {
  const [source, setSource] = useState('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const skillSource = source.trim();
    if (!skillSource) {
      toast.error('Enter a skills repository or source');
      return;
    }
    try {
      setIsSubmitting(true);
      await installSkill(skillSource);
      toast.success('Skill installed. Refreshing available skills…');
      setSource('');
      onOpenChange(false);
      onSkillAdded();
    } catch (err) {
      toast.error(`Skill installation failed: ${String(err)}`);
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
              Install a Skill (نصب مهارت)
            </DialogTitle>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Install skills from a repository using the skills CLI. Goose discovers installed SKILL.md files automatically.
            Node.js and npm/npx must be available on your PATH.
          </p>
        </DialogHeader>

        <div className="my-3 p-2 bg-background-secondary rounded-lg border border-border-primary">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full flex items-center gap-2"
            onClick={handleOpenSkillsFolder}
          >
            <FolderOpen className="w-4 h-4" />
            Open Skills Folder (پوشه مهارت‌ها)
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-text-primary mb-1 block">
              GitHub repository or npx command
            </label>
            <Input
              value={source}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSource(e.target.value)}
              placeholder="e.g. npx skills add Barty-Bart/motion-graphics"
              disabled={isSubmitting}
              required
              className="font-mono text-sm"
            />
          </div>
          <p className="text-xs text-text-secondary">
            Installs all skills from the repository to <code>~/.agents/skills</code> using npx,
            without terminal prompts. You can paste a GitHub URL, owner/repo, or npx skills add command.
          </p>
          <DialogFooter className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {isSubmitting ? 'Installing...' : 'Install Skill'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export default AddSkillDialog;
