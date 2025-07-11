export async function getFilename(tabId: number) {
  return (await browser.scripting.executeScript({
    target: { tabId },
    func: () => {
      function formatTime(t: number) {
        const h = String(Math.floor(t / 3600)).padStart(2, '0')
        const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0')
        const s = String(Math.floor(t % 60)).padStart(2, '0')
        return `${h}_${m}_${s}`
      }

      const title = document.querySelector<HTMLElement>('[class^=\'PlayerControlsMetadata-container\'] a')?.title || document.querySelector<HTMLElement>('title')?.textContent
        || '未知作品'
      // console.log("作品名:", title);
      // 获取副标题
      const container = document.querySelector<HTMLElement>(
        '[class^="PlayerControlsMetadata-container"]',
      )
      const episodeElement = container?.querySelector<HTMLElement>(
        '[class*="isSecondary"]',
      )
      const episode = episodeElement?.textContent?.trim() || '-'
      // console.log("集数与副标题:", episode);
      const video = document.querySelector('video')
        || document.querySelector('mux-player')?.shadowRoot?.querySelector('mux-video')?.shadowRoot?.querySelector('video')
      const currentTime = video ? formatTime(video.currentTime) : '未知时间'

      return `[${title}] - ${episode} - ${currentTime}`
    },
  }))[0].result!
}

export async function capture(tabId: number, filename: string) {
  const copyToClipboard = await storage.getItem('local:copyToClipboard', {
    fallback: false,
  })
  const imageType = await storage.getItem('local:imageType', { fallback: 'image/png' })
  let extension
  switch (imageType) {
    case 'image/jpeg':
      extension = 'jpg'
      break
    case 'image/webp':
      extension = 'webp'
      break
    default:
      extension = 'png'
      break
  }

  console.log('copyToClipboard', copyToClipboard, 'type:', typeof copyToClipboard)
  const imageQuality = await storage.getItem('local:imageQuality', { fallback: 0.95 })
  console.log('imageQuality', imageQuality, 'type:', typeof imageQuality)
  // const imageQuality = 0.1
  const isChrome = import.meta.env.CHROME

  return browser.scripting.executeScript({
    target: { tabId },
    func: (filename: string, copyToClipboard: boolean, isChrome: boolean, imageType: string, imageQuality: number) => {
      console.log('imageType', imageType)

      console.log('imageQuality', imageQuality)

      function showToast(msg: string) {
        console.log('showToast called', msg)
        // 创建一个简单的 toast 通知
        const toast = document.createElement('div')
        toast.textContent = msg
        toast.style.cssText = `
    position:fixed;top:32px;left:50%;transform:translateX(-50%);
    background:#323232;color:#fff;padding:12px 24px;border-radius:6px;
    font-size:16px;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.2);
    opacity:0;transition:opacity 0.3s;
  `
        document.body.appendChild(toast)
        setTimeout(() => (toast.style.opacity = '1'), 10)
        // 自动隐藏 toast
        setTimeout(() => {
          toast.style.opacity = '0'
          setTimeout(() => toast.remove(), 300)
        }, 2000)
      }
      const video = document.querySelector('video')
        || document.querySelector('mux-player')?.shadowRoot?.querySelector('mux-video')?.shadowRoot?.querySelector('video')
      console.log(video)
      if (!video) {
        // eslint-disable-next-line no-alert
        alert('找不到视频播放器')
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const context = canvas.getContext('2d')!
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      console.log('after drawImage')

      canvas.toBlob(async (blob) => {
        if (!blob) {
          console.error('Failed to create blob from canvas')
          return
        }

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${filename}.${extension}`
        a.click()
        URL.revokeObjectURL(url)

        if (copyToClipboard) {
          // 重新导出 PNG blob 用于剪贴板
          canvas.toBlob(async (pngblob) => {
            if (!pngblob) {
              console.error('Failed to create blob from canvas for clipboard')
              return
            }
            try {
              let clipboardPermission = true
              if (isChrome) {
                const permissionResult = await navigator.permissions.query({ name: 'clipboard-write' as PermissionName })
                clipboardPermission = permissionResult.state === 'granted' || permissionResult.state === 'prompt'
              }

              if (!clipboardPermission) {
                showToast('复制失败，请检查剪切板权限或当前环境是否为 HTTPS')
              // throw new Error('Clipboard permission denied')
              }

              console.log('Clipboard permission granted:', clipboardPermission)

              if (!navigator.clipboard || !window.ClipboardItem) {
                showToast('复制失败，请检查当前环境是否为 HTTPS')
              // throw new Error('当前环境不支持剪贴板写入（需要 HTTPS）')
              }

              console.log('Copying to clipboard...')
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': pngblob }),
              ])
              showToast('截图已复制到剪贴板')
            }
            catch (e) {
            // console.error(e instanceof Error ? e.message : e)
              const errormsg = e instanceof Error ? e.message : String(e)
              showToast(`复制失败： ${errormsg}`)
            }
          }, 'image/png')
        }
      }, imageType, imageQuality)
    },
    args: [filename, copyToClipboard, isChrome, imageType, imageQuality],
  })
}

export default {
  getFilename,
  capture,
}
