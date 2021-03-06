const electron = require('electron')
const {Tray, Menu} = electron

const NotificationCenter = require('node-notifier').NotificationCenter

let notifier

const AutoLaunch = require('auto-launch')
const fs = require('fs')

const ShortcutManager = require('./components/shortcutManager')

const ipc = electron.ipcMain

const config = require('./config')

const app = new class {
  constructor () {
    this.appPath = electron.app.getPath('exe').split('.app/Content')[0] + '.app'

    if (!this.appPath.includes('electron')) {
      this.appLauncher = new AutoLaunch({
        name: 'Katana',
        path: this.appPath
      })

      notifier = new NotificationCenter({
        withFallback: true,
        customPath: this.appPath + '/Contents/Resources/app.asar.unpacked/app/resources/notifier.app/Contents/MacOS/terminal-notifier'
      })
    } else {
      notifier = new NotificationCenter({
        withFallback: true,
        customPath: __dirname + '/resources/notifier.app/Contents/MacOS/terminal-notifier'
      })
    }

    this.preferencesModule = new (require('./components/preferences'))(this)
    this.updaterModule = new (require('./components/updater'))(this)
    this.screenshotModule = new (require('./components/screenshot'))(this)
    this.shortenerModule = new (require('./components/urlShortener'))(this)

    const startAtLogin = this.preferencesModule.getOption('startAtLogin')

    if (startAtLogin === true && this.appLauncher) {
      this.appLauncher.enable()
    }

    ipc.on('getVersion', (event, arg) => {
      const version = require('../package').version
      event.sender.send('getVersion', version)
    })

    // create application home dir if it doesn't exist
    this.validateHome()

    // initialize menu bar
    this.createTray()
  }

  validateHome () {
    try {
      fs.statSync(config.paths.application)
    } catch (e) {
      if (e.errno === -2) {
        fs.mkdirSync(config.paths.application)
        fs.mkdirSync(config.paths.uploads)
      }
    }
  }

  createTray () {
    this.app = electron.app
    this.app.dock.hide()

    if (this.preferencesModule.getOption('showIcon')) {
      this.app.dock.show()
    }

    // supposedly helps with performance?
    // who knows, if it causes issues i can yank it
    this.app.commandLine.appendSwitch('disable-renderer-backgrounding')

    this.app.on('ready', () => {
      this.shortcutManager = new ShortcutManager(this)
      this.tray = new Tray(config.icons.tray.default)

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Take Screenshot',
          type: 'normal',
          click: () => {
            this.screenshotModule.captureSelection()
          }
        },

        {
          label: 'Recent',
          type: 'normal',
          submenu: [
          ]
        },

        { type: 'separator' },

        {
          label: 'Preferences...',
          type: 'normal',
          accelerator: 'Cmd+,',
          click: () => {
            this.preferencesModule.showWindow()
          }
        },

        {
          label: 'Quit',
          type: 'normal',
          accelerator: 'Cmd+Q',
          click: () => {
            this.app.quit()
          }
        }
      ])

      this.tray.on('drop-files', (event, files) => {
        const file = files[0]
        const ext = file.split('.').pop()

        const allowed = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'pdf']

        if (allowed.includes(ext)) {
          console.log('Uploading image...')

          this.screenshotModule.upload(file, (result, error) => {
            if (!error) {
              this.showNotification('Image has been successfully uploaded and copied to your clipboard!', result.link)
            } else {
              this.showNotification('Unable to upload screenshot')
            }
          }, true)
        }
      })

      this.tray.setToolTip('Katana')
      this.tray.setContextMenu(contextMenu)
    })
  }

  showNotification (message, url) {
    notifier.notify({
      title: 'Katana',
      message: message,
      sound: 'default',
      open: url
    })
  }

  setIcon (type) {
    this.tray.setImage(config.icons.tray[type])
  }

  something () {
    // suppress lint warning
  }
}()

app.something()
