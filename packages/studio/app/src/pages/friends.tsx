import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useRefresh } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Body, PageHeader, Section } from '@/components/page';

const count = (t: string) => t.split('\n').filter((l) => l.trim()).length;

/** 友人帐：一行一位，[名字](链接)+(头像)+(描述)；已失联的文本原样显示成代码块 */
export default function Friends() {
  const refresh = useRefresh();
  const { data, refetch } = useQuery({ queryKey: ['friends'], queryFn: api.friends, staleTime: 0, refetchOnWindowFocus: false });
  const [text, setText] = useState('');
  const [lost, setLost] = useState('');
  const [base, setBase] = useState({ text: '', lost: '' });
  useEffect(() => { if (data) { setText(data.text); setLost(data.lost); setBase({ text: data.text, lost: data.lost }); } }, [data]);
  const dirty = text !== base.text || lost !== base.lost;

  const save = async () => {
    try { await api.saveFriends(text, lost); await Promise.all([refetch(), refresh()]); toast.success('已保存'); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="友人帐" sub={`${count(text)} 位`} actions={dirty && <><Button variant="ghost" onClick={() => { setText(base.text); setLost(base.lost); }}>放弃修改</Button><Button variant="default" onClick={save}>保存</Button></>} />
      <Body>
        <Section title="友人">
          <Textarea variant="code" className="min-h-72" spellCheck={false} value={text} placeholder="[名字](链接)+(头像)+(描述)" onChange={(e) => setText(e.target.value)} />
        </Section>
        <Section title="已失联">
          <Textarea variant="code" className="min-h-40" spellCheck={false} value={lost} onChange={(e) => setLost(e.target.value)} />
        </Section>
      </Body>
    </>
  );
}
