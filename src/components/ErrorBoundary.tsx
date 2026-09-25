import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** 出错时显示的场景名（如「反馈生成」），便于老师知道哪一块坏了 */
  label?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * 局部错误边界：某一页/某一块渲染出错时，只把那一块替换成可读提示，
 * 而不是让整个页面白屏（历史 bug：课次配置缺 feedbackTemplate 时
 * 反馈生成抛错，React 卸载整棵树 → 全站白屏，用户以为"数据丢了"）。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 保留现场：控制台留可追溯信息，便于后续定位
    console.error('[ErrorBoundary]', this.props.label || '', error, info?.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Card className="border-0 border-l-4 border-l-rose-400 ios-glass-card">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[color:var(--ink)]">
                {this.props.label ? `「${this.props.label}」这一块没能正常显示` : '这一块没能正常显示'}
              </p>
              <p className="text-sm text-[color:var(--ink-3)] mt-1">
                其他页面不受影响，数据也都还在本地。可以先点「重试」；若反复出现，请把下面这行信息发给老师助手。
              </p>
              <p className="text-xs text-[color:var(--ink-4)] mt-2 font-mono break-all">
                {String(error?.message || error)}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" className="h-9 gap-2 ios-button" onClick={this.reset}>
                  <RotateCcw className="w-4 h-4" />重试
                </Button>
                <Button size="sm" variant="outline" className="h-9 gap-2 rounded-[var(--r-md)]" onClick={() => window.location.reload()}>
                  <Home className="w-4 h-4" />刷新页面
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
}
