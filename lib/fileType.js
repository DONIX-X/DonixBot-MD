async function fileTypeFromBuffer(buffer) {
    const fileType = await import('file-type');
    return fileType.fileTypeFromBuffer(buffer);
}

module.exports = { fileTypeFromBuffer };
