const qiniu = require('qiniu');
const fs = require('fs');
const path = require('path');

const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;
const bucket = process.env.QINIU_BUCKET;
const domain = process.env.QINIU_DOMAIN;

const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);

async function uploadFile(filePath, fileName) {
  try {
    const options = {
      scope: bucket,
      expires: 7200
    };
    
    const putPolicy = new qiniu.rs.PutPolicy(options);
    const uploadToken = putPolicy.uploadToken(mac);
    
    const config = new qiniu.conf.Config();
    config.zone = qiniu.zone.Zone_z2;
    config.useHttpsDomain = true;
    config.useCdnDomain = false;
    
    const formUploader = new qiniu.form_up.FormUploader(config);
    const putExtra = new qiniu.form_up.PutExtra();
    
    const fileBuffer = fs.readFileSync(filePath);
    
    return new Promise((resolve, reject) => {
      formUploader.put(
        uploadToken,
        fileName,
        fileBuffer,
        putExtra,
        (respErr, respBody, respInfo) => {
          if (respErr) {
            reject(respErr);
          } else if (respInfo.statusCode === 200) {
            const fileUrl = `${domain}/${respBody.key}`;
            resolve({
              url: fileUrl,
              key: respBody.key,
              hash: respBody.hash
            });
          } else {
            reject(new Error(`Upload failed: ${respInfo.statusCode}`));
          }
        }
      );
    });
  } catch (error) {
    console.error('Qiniu Upload Error:', error);
    throw new Error(`七牛云上传失败：${error.message}`);
  }
}

function createDownloadUrl(fileName, expires = 3600) {
  const deadline = Math.floor(Date.now() / 1000) + expires;
  const downloadUrl = qiniu.rs.getPublicUrl(domain, fileName);
  
  const downloadPrivateUrl = new qiniu.util.Url(downloadUrl);
  downloadPrivateUrl.query = downloadPrivateUrl.query || {};
  downloadPrivateUrl.query.e = deadline;
  
  return downloadPrivateUrl.toString();
}

module.exports = {
  uploadFile,
  createDownloadUrl
};
