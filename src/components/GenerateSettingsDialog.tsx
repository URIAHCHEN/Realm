import { BarChart3, Columns3, SlidersHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DisplaySettingsPanel } from '@/components/DisplaySettingsPanel';
import { ConfigPanel } from '@/components/ConfigPanel';
import type { useDisplaySettings } from '@/hooks/useDisplaySettings';
import type { AppConfig, LessonConfig } from '@/types';

interface GenerateSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  display: ReturnType<typeof useDisplaySettings>;
  appConfig: AppConfig;
  lessonConfig: LessonConfig;
  lessonNumber: number;
  onSaveAppConfig: (config: AppConfig) => void;
  onSaveLessonConfig: (lessonNumber: number, config: Partial<LessonConfig>) => void;
}

/**
 * 生成设置：由「学情记录 → 配置题型」入口打开。
 * 内含两页：数据可视化（显示规则/配色）与表格字段（字段显隐、自定义标题、题型与全局默认选项）。
 * 内容与原先位于「反馈生成」页的同名模块一致，只是入口迁移到录分时更顺手的位置。
 */
export function GenerateSettingsDialog({
  open, onOpenChange, display, appConfig, lessonConfig, lessonNumber, onSaveAppConfig, onSaveLessonConfig,
}: GenerateSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="liquid-glass-card sm:max-w-[min(1280px,96vw)] w-[96vw] h-[86vh] sm:h-[84vh] overflow-hidden flex flex-col p-0 gap-0"
      >
        <DialogHeader className="px-7 pt-5 pb-4 border-b border-black/[0.06] flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base text-[color:var(--ink)]">
            <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--brand)' }} />
            生成设置
          </DialogTitle>
          <p className="text-xs text-[color:var(--ink-4)] mt-1">
            调整学情表字段、板块归类、显示与公示样式；保存后学情记录与反馈即时生效
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-7 py-5">
          <Tabs defaultValue="visualization" className="gap-5">
            <TabsList className="grid w-full grid-cols-2 h-10 p-1 rounded-[var(--r-md)]">
              <TabsTrigger
                value="visualization"
                className="gap-1.5 text-sm rounded-[var(--r-md)] data-[state=active]:bg-[color:var(--brand)] data-[state=active]:text-white data-[state=active]:shadow-sm"
              >
                <BarChart3 className="w-4 h-4" />数据可视化
              </TabsTrigger>
              <TabsTrigger
                value="fields"
                className="gap-1.5 text-sm rounded-[var(--r-md)] data-[state=active]:bg-[color:var(--brand)] data-[state=active]:text-white data-[state=active]:shadow-sm"
              >
                <Columns3 className="w-4 h-4" />表格字段
              </TabsTrigger>
            </TabsList>

            <TabsContent value="visualization">
              <DisplaySettingsPanel display={display} />
            </TabsContent>

            <TabsContent value="fields">
              <ConfigPanel
                appConfig={appConfig}
                lessonConfig={lessonConfig}
                lessonNumber={lessonNumber}
                onSaveAppConfig={onSaveAppConfig}
                onSaveLessonConfig={onSaveLessonConfig}
              />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
