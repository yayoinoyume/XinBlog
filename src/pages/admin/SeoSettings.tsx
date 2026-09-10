import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Autocomplete,
  IconButton,
  Button,
  alpha,
  Fade,
  Link,
  ListItemText,
  List,
  ListItem,
  Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useSiteStore } from '@/stores/siteStore';
import { Loading } from '@/components/Common/Loading';
import { FloatingSaveButton } from '@/components/Common/FloatingSaveButton';
import { useSnackbar } from 'notistack';

// 常见搜索引擎站点验证的 meta name（来自各站长平台的「HTML 标签」验证方式）
const ENGINE_OPTIONS = [
  { label: '谷歌 Google（google-site-verification）', name: 'google-site-verification' },
  { label: '必应 Bing（msvalidate.01）', name: 'msvalidate.01' },
  { label: '百度（baidu-site-verification）', name: 'baidu-site-verification' },
  { label: '360 搜索（360-site-verification）', name: '360-site-verification' },
  { label: '搜狗（sogou_site_verification）', name: 'sogou_site_verification' },
  { label: 'Yandex（yandex-verification）', name: 'yandex-verification' },
];

export function SeoSettings() {
  const { enqueueSnackbar } = useSnackbar();
  const { loadConfig, saveConfig } = useSiteStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<{ name: string; content: string }[]>([]);
  const [savedJson, setSavedJson] = useState('[]');
  const isDirty = JSON.stringify(list) !== savedJson;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      await loadConfig(true);
      if (!cancelled) {
        const v = useSiteStore.getState().config.seoVerifications || [];
        setList(v.map((x) => ({ name: x.name || '', content: x.content || '' })));
        setSavedJson(JSON.stringify(v.map((x) => ({ name: x.name || '', content: x.content || '' }))));
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [loadConfig]);

  const handleSave = async () => {
    const cleaned = list.filter((x) => x.name.trim() && x.content.trim());
    setSaving(true);
    const ok = await saveConfig({ seoVerifications: cleaned });
    setSaving(false);
    if (ok) {
      setList(cleaned);
      setSavedJson(JSON.stringify(cleaned));
      enqueueSnackbar('SEO 设置已保存', { variant: 'success' });
    } else {
      enqueueSnackbar('保存失败，请稍后再试', { variant: 'error' });
    }
  };

  if (loading) return <Loading />;

  const sitemapUrl = `${window.location.origin}/sitemap.xml`;

  return (
    <Fade in timeout={400}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          borderRadius: 1,
          boxShadow: (theme) =>
            theme.palette.mode === 'light'
              ? `0 4px 20px ${alpha(theme.palette.primary.main, 0.08)}`
              : `0 4px 20px ${alpha(theme.palette.common.black, 0.25)}`,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, overflowWrap: 'break-word' }}>
          SEO 设置
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          在各搜索引擎站长平台选择「HTML 标签」验证方式，把 meta 标签的 name 和 content 填到下面；保存后标签会自动注入每个页面，回到站长平台点击验证即可。
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              站点验证标签
            </Typography>
            <Stack spacing={1.5}>
              {list.map((item, i) => (
                <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                  <Autocomplete
                    freeSolo
                    options={ENGINE_OPTIONS.map((o) => o.name)}
                    value={item.name}
                    onChange={(_, v) => setList((l) => l.map((x, j) => (j === i ? { ...x, name: v || '' } : x)))}
                    onInputChange={(_, v) => setList((l) => l.map((x, j) => (j === i ? { ...x, name: v || '' } : x)))}
                    sx={{ minWidth: { sm: 280 }, flex: { sm: '0 0 280px' } }}
                    renderInput={(params) => (
                      <TextField {...params} size="small" placeholder="meta name（可自定义）" />
                    )}
                  />
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="content 值（验证码）"
                    value={item.content}
                    onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))}
                  />
                  <IconButton aria-label="删除" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
                    <DeleteOutlineIcon />
                  </IconButton>
                </Stack>
              ))}
              <Button
                startIcon={<AddIcon />}
                onClick={() => setList((l) => [...l, { name: '', content: '' }])}
                sx={{ alignSelf: 'flex-start' }}
              >
                添加搜索引擎
              </Button>
            </Stack>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              各平台入口
            </Typography>
            <List dense sx={{ py: 0 }}>
              <ListItem disableGutters>
                <ListItemText
                  primary={
                    <>
                      谷歌：{' '}
                      <Link href="https://search.google.com/search-console" target="_blank" rel="noreferrer">
                        Google Search Console
                      </Link>{' '}
                      —— 「网址前缀」添加资源 → HTML 标签 → 复制 content
                    </>
                  }
                />
              </ListItem>
              <ListItem disableGutters>
                <ListItemText
                  primary={
                    <>
                      必应：{' '}
                      <Link href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer">
                        Bing Webmaster Tools
                      </Link>{' '}
                      —— 可直接从 Google Search Console 导入，或手动添加站点后选 HTML 标签
                    </>
                  }
                />
              </ListItem>
              <ListItem disableGutters>
                <ListItemText
                  primary={
                    <>
                      百度：{' '}
                      <Link href="https://ziyuan.baidu.com/" target="_blank" rel="noreferrer">
                        百度搜索资源平台
                      </Link>{' '}
                      —— 添加网站 → 验证网站 → HTML 标签
                    </>
                  }
                />
              </ListItem>
            </List>
          </Box>

          <Typography variant="body2" color="text.secondary">
            提示：站点已内置 <code>/sitemap.xml</code>（随文章自动更新）与 <code>/robots.txt</code>，无需手动维护；
            验证通过后在各平台的「站点地图/普通收录」中提交 <code>{sitemapUrl}</code>，新文章一般会在数分钟到数天内被收录。
          </Typography>
        </Box>

        <FloatingSaveButton show={isDirty} saving={saving} onClick={handleSave} label="保存 SEO 设置" />
      </Paper>
    </Fade>
  );
}
