import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export function useProject() {
  return useQuery({ queryKey: ['project'], queryFn: api.project, staleTime: 5_000, refetchOnWindowFocus: true });
}

/** 内容、设置变了以后调用：项目信息（列表、配置、角标）和统计都重新读 */
export function useRefresh() {
  const qc = useQueryClient();
  return useCallback(() => Promise.all([qc.invalidateQueries({ queryKey: ['project'] }), qc.invalidateQueries({ queryKey: ['stats'] })]), [qc]);
}
