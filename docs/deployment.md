# 部署 / Deployment

`npm run build` 生成纯静态站点 `dist/`，可以放到任何静态托管（Nginx、Cloudflare Pages、Vercel、GitHub Pages）。

## 子路径

```bash
ATLAS_BASE=/words/ npm run build
```

## Nginx 示例

```nginx
location ^~ /words/ {
    alias /var/www/word-atlas/;
    try_files $uri $uri/ /words/index.html;
    expires 7d;
}
```

## GitHub Pages

在仓库 Settings → Pages 选择 “GitHub Actions”，然后手动运行
“Deploy Word Atlas to GitHub Pages”。工作流会根据 Pages 设置自动使用正确的子路径。

## 体积

插画与音频合计约数百 MB。建议在 CDN 后部署，或按需只发布 `thumb/` 和部分音频。

预览部署可以在构建时设定
`VITE_ATLAS_MEDIA_BASE=https://0xlei.tech/words/atlas`，让公开图鉴的图片及录音沿用
Word Atlas 原站。这种部署可从 `dist/atlas/` 省去 `img`、`thumb` 和 `audio`，
并须保留 `index.json` 和 `entries/`。自订词库中的学习记录仍在浏览器本机。

私人站点可在构建时设定 `ATLAS_PRIVATE_PRESET_FILE`，指向包含 `id`、`name`
和 `words` 的 JSON。使用以 `preset-` 开头的固定 ID。浏览器只会加入该词库一次。
输入文件应放在储存库以外，含该词库的构建产物仅适合部署到具访问控制的站点。

私人站點可另設 `ATLAS_PRIVATE_AUDIO_DIR`，指向詞條的備用美式語音 MP3 目錄。檔名使用
`<詞條 id>.mp3`，例如 `personal-abc123.mp3`。建置會以內容雜湊為檔案加上版本。
備用音檔與詞庫來源一同存放在公開儲存庫之外，並僅隨私人站點發布。
