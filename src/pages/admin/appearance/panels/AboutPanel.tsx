import { Box, Paper, Stack, alpha, TextField, IconButton, Button, Typography, Autocomplete, Tooltip } from '@mui/material';
import { createElement } from 'react';
import { Add, DeleteOutline, Close, Image as ImageIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import type { AppearanceEditor } from '../useAppearanceEditor';
import type { SocialLink } from '@/types';
import { getSocialPlatformIcon } from '@/utils/socialLinks';
import { uploadMedia, deleteMedia, extractMediaId } from '@/api/media';
import { getBase64Size, compressImage } from '@/utils/image';

const MAX_ICON_SIZE = 256 * 1024;
const ICON_DIM = 128;

const PLATFORM_PRESETS = [
  'github',
  'x',
  'wechat',
  'bilibili',
  'zhihu',
  'discord',
  'gitee',
  'juejin',
  'csdn',
  'tiktok',
  'xiaohongshu',
  'neteasecloudmusic',
  'qq',
  'douban',
  'rss',
  'website',
  'email',
  'youtube',
  'facebook',
  'instagram',
  'linkedin',
  'telegram',
  'reddit',
  'bluesky',
  'mastodon',
  'spotify',
];

function emptySocial(): SocialLink {
  return { platform: '', label: '', url: '' };
}

/** 单个社交链接的图标上传/清除控件。 */
function SocialIconField({
  value,
  platform,
  onChange,
}: {
  value?: string;
  platform: string;
  onChange: (v: string | undefined) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();

  const handleUpload = async (file: File) => {
    try {
      const base64 = await compressImage(file, MAX_ICON_SIZE, ICON_DIM);
      if (getBase64Size(base64) > MAX_ICON_SIZE) {
        enqueueSnackbar('图标压缩后仍超过 256KB，请换更小的图', { variant: 'error' });
        return;
      }
      const media = await uploadMedia(file.name, base64);
      onChange(media.url);
      enqueueSnackbar('图标已上传', { variant: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '图标处理失败';
      enqueueSnackbar(msg, { variant: 'error' });
    }
  };

  const handleClear = () => {
    const mediaId = extractMediaId(value);
    if (mediaId) {
      deleteMedia(mediaId).catch(() => undefined);
    }
    onChange(undefined);
  };

  const brandIcon = getSocialPlatformIcon(platform);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {value ? (
        <Box sx={{ position: 'relative', display: 'inline-block' }}>
          <Box
            component="img"
            src={value}
            alt="自定义图标预览"
            sx={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 1 }}
          />
          <IconButton
            onClick={handleClear}
            size="small"
            aria-label="移除图标"
            sx={{
              position: 'absolute',
              top: -8,
              right: -8,
              width: 20,
              height: 20,
              bgcolor: 'background.paper',
              boxShadow: 1,
            }}
          >
            <Close fontSize="inherit" />
          </IconButton>
        </Box>
      ) : (
        <Tooltip title="未上传自定义图标，默认显示品牌图标">
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
              border: (theme) => `1px dashed ${theme.palette.divider}`,
            }}
          >
            {createElement(brandIcon, { size: 22 })}
          </Box>
        </Tooltip>
      )}
      <Button variant="outlined" size="small" component="label" startIcon={<ImageIcon />}>
        {value ? '更换图标' : '上传图标'}
        <input type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = '';
        }} />
      </Button>
    </Box>
  );
}

export function AboutPanel({ editor }: { editor: AppearanceEditor }) {
  const { aboutSubtitle, setAboutSubtitle, aboutBio, setAboutBio, aboutTags, setAboutTags, aboutSocials, setAboutSocials } = editor;

  const updateSocial = (index: number, patch: Partial<SocialLink>) => {
    setAboutSocials((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 3 },
        borderRadius: 1,
        overflow: 'hidden',
        boxShadow: (theme) =>
          theme.palette.mode === 'light'
            ? `0 4px 20px ${alpha(theme.palette.primary.main, 0.08)}`
            : `0 4px 20px ${alpha(theme.palette.common.black, 0.25)}`,
      }}
    >
      <Stack spacing={3}>
        <TextField label="副标题" value={aboutSubtitle} onChange={(e) => setAboutSubtitle(e.target.value)} fullWidth />
        <TextField
          label="个人简介"
          value={aboutBio}
          onChange={(e) => setAboutBio(e.target.value)}
          fullWidth
          multiline
          rows={4}
        />
        <TextField
          label="标签（用中文顿号、分隔）"
          value={aboutTags}
          onChange={(e) => setAboutTags(e.target.value)}
          fullWidth
          placeholder="热爱生活、喜欢设计、追求技术"
        />

        <Box>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
            社交链接
          </Typography>
          <Stack spacing={1.5}>
            {aboutSocials.map((social, index) => (
              <Stack
                key={index}
                spacing={1}
                sx={{
                  p: 1.5,
                  border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                  borderRadius: 1,
                }}
              >
                <SocialIconField
                  value={social.icon}
                  platform={social.platform}
                  onChange={(icon) => updateSocial(index, { icon })}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                  <Autocomplete
                    freeSolo
                    options={PLATFORM_PRESETS}
                    value={social.platform}
                    onChange={(_, v) => updateSocial(index, { platform: v || '' })}
                    onInputChange={(_, v) => updateSocial(index, { platform: v || '' })}
                    renderInput={(params) => (
                      <TextField {...params} label="平台" placeholder="如 github" sx={{ minWidth: { sm: 130 } }} />
                    )}
                    sx={{ flex: { sm: '0 0 140px' } }}
                  />
                  <TextField
                    label="名称"
                    value={social.label}
                    onChange={(e) => updateSocial(index, { label: e.target.value })}
                    placeholder="GitHub"
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="链接"
                    value={social.url}
                    onChange={(e) => updateSocial(index, { url: e.target.value })}
                    placeholder="https://github.com/yourname"
                    sx={{ flex: 1.5 }}
                  />
                  <IconButton
                    onClick={() => setAboutSocials((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="删除此链接"
                    sx={{ alignSelf: 'center' }}
                  >
                    <DeleteOutline />
                  </IconButton>
                </Stack>
              </Stack>
            ))}
          </Stack>
          <Button startIcon={<Add />} onClick={() => setAboutSocials((prev) => [...prev, emptySocial()])} sx={{ mt: 1.5 }}>
            添加社交链接
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            留空名称或链接的行在保存时会被忽略。平台决定显示的图标；也可上传自定义 logo 图片（自动压缩至 256KB 内），上传后优先显示图片。
          </Typography>
        </Box>
      </Stack>

    </Paper>

  );
}