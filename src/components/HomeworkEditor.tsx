import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, FileText } from 'lucide-react';

interface HomeworkEditorProps {
  homeworkText: string;
  onSave: (text: string) => void;
}

export function HomeworkEditor({ homeworkText, onSave }: HomeworkEditorProps) {
  const [text, setText] = useState(homeworkText);

  useEffect(() => {
    setText(homeworkText);
  }, [homeworkText]);

  const handleSave = () => {
    onSave(text);
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
            <FileText className="w-4 h-4 text-indigo-600" />
          </div>
          作业内容
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="请输入本课次作业内容..."
          className="min-h-[100px] resize-none text-sm"
        />
        <Button
          onClick={handleSave}
          variant="outline"
          className="w-full gap-2"
        >
          <Save className="w-4 h-4" />
          保存作业内容
        </Button>
      </CardContent>
    </Card>
  );
}
