// Picks a file/photo/voice clip and uploads it to the backend ingestion
// endpoint, which runs Tencent Cloud OCR/ASR and returns extracted text.
const { API_BASE_URL } = require('./config.js');

function uploadFile(filePath, path) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}${path}`,
      filePath,
      name: 'file',
      success: (res) => {
        try {
          const body = JSON.parse(res.data);
          if (res.statusCode >= 400) {
            reject(new Error(body.detail || 'Upload failed'));
          } else {
            resolve(body);
          }
        } catch (err) {
          reject(err);
        }
      },
      fail: reject,
    });
  });
}

function chooseAndUploadImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        uploadFile(res.tempFiles[0].tempFilePath, '/ingest/image').then(resolve, reject);
      },
      fail: reject,
    });
  });
}

let recorderManager = null;

function ensureRecordAuth() {
  return new Promise((resolve, reject) => {
    wx.getSetting({
      success: (res) => {
        const authStatus = res.authSetting['scope.record'];
        if (authStatus === true) {
          resolve();
        } else if (authStatus === false) {
          // Previously denied: the only way back in is the app's settings screen.
          wx.showModal({
            title: 'Microphone access needed',
            content: 'Please enable microphone access in settings to record voice.',
            // wx.showModal caps confirmText at 4 characters — 'Open
            // settings' silently fails the whole modal (showModal:fail).
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting({
                  success: (settingRes) => {
                    if (settingRes.authSetting['scope.record']) {
                      resolve();
                    } else {
                      reject(new Error('Microphone permission was not granted'));
                    }
                  },
                  fail: reject,
                });
              } else {
                reject(new Error('Microphone permission was not granted'));
              }
            },
            fail: reject,
          });
        } else {
          // Never asked yet.
          wx.authorize({ scope: 'scope.record', success: resolve, fail: reject });
        }
      },
      fail: reject,
    });
  });
}

function startVoiceRecording() {
  return ensureRecordAuth().then(
    () =>
      new Promise((resolve, reject) => {
        recorderManager = wx.getRecorderManager();
        recorderManager.onError((err) => reject(new Error(err.errMsg || 'Recording failed to start')));
        recorderManager.onStart(() => resolve());
        recorderManager.start({ format: 'mp3' });
      }),
  );
}

function stopVoiceRecordingAndUpload() {
  return new Promise((resolve, reject) => {
    if (!recorderManager) {
      reject(new Error('Recording was not started'));
      return;
    }
    recorderManager.onStop((res) => {
      const audioCtx = wx.createInnerAudioContext();
      audioCtx.src = res.tempFilePath;
      audioCtx.play();
      uploadFile(res.tempFilePath, '/ingest/audio').then(resolve, reject);
    });
    recorderManager.stop();
  });
}

module.exports = {
  chooseAndUploadImage,
  startVoiceRecording,
  stopVoiceRecordingAndUpload,
};
