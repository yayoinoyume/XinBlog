import { lazy, Suspense } from 'react';
import { Add, Comment, Label, PermMedia } from '@mui/icons-material';

const AdminFrameFab = lazy(() => import('./AdminFrameFab').then((m) => ({ default: m.AdminFrameFab })));

function HomeAdminFab(props: React.ComponentProps<typeof AdminFrameFab>) {
  return (
    <Suspense fallback={null}>
      <AdminFrameFab {...props} />
    </Suspense>
  );
}

export default function AdminHomeActions() {
  return (
    <>
      <HomeAdminFab adminPath="/admin/posts?compose=1&embed=1" label="写文章" icon={<Add />} onSaved={() => window.location.reload()} />
      <HomeAdminFab adminPath="/admin/comments?embed=1" label="管理评论" icon={<Comment />} bottomOffset={64} onSaved={() => window.location.reload()} />
      <HomeAdminFab adminPath="/admin/media?embed=1" label="管理媒体" icon={<PermMedia />} bottomOffset={128} />
      <HomeAdminFab adminPath="/admin/tags?embed=1" label="管理标签" icon={<Label />} bottomOffset={192} />
    </>
  );
}
