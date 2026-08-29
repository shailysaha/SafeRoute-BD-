// ============================================
// Cloudinary Evidence Upload
// SafeRoute BD
// ============================================

const CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

const UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;


// ============================================
// FILE LIMITS
// ============================================

const MAX_IMAGE_SIZE =
  10 * 1024 * 1024; // 10 MB

const MAX_VIDEO_SIZE =
  50 * 1024 * 1024; // 50 MB


// ============================================
// ALLOWED TYPES
// ============================================

const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];


// ============================================
// VALIDATE FILE
// ============================================

function validateEvidenceFile(file) {

  if (!file) {
    throw new Error(
      "Invalid evidence file."
    );
  }


  const isImage =
    IMAGE_TYPES.includes(file.type);

  const isVideo =
    VIDEO_TYPES.includes(file.type);


  if (!isImage && !isVideo) {
    throw new Error(
      `${file.name}: Only JPG, PNG, WEBP, MP4, WEBM and MOV files are allowed.`
    );
  }


  if (
    isImage &&
    file.size > MAX_IMAGE_SIZE
  ) {
    throw new Error(
      `${file.name}: Image must be smaller than 10 MB.`
    );
  }


  if (
    isVideo &&
    file.size > MAX_VIDEO_SIZE
  ) {
    throw new Error(
      `${file.name}: Video must be smaller than 50 MB.`
    );
  }


  return {
    isImage,
    isVideo,
  };
}


// ============================================
// UPLOAD ONE FILE
// ============================================

export async function uploadEvidenceFile(
  file,
  userId,
  incidentId
) {

  validateEvidenceFile(file);


  if (!CLOUD_NAME) {
    throw new Error(
      "Cloudinary cloud name is missing."
    );
  }


  if (!UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary upload preset is missing."
    );
  }


  // ------------------------------------------
  // Decide resource type
  // ------------------------------------------

  const resourceType =
    file.type.startsWith("video/")
      ? "video"
      : "image";


  // ------------------------------------------
  // Cloudinary endpoint
  // ------------------------------------------

  const uploadURL =
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;


  // ------------------------------------------
  // FormData
  // ------------------------------------------

  const formData =
    new FormData();


  formData.append(
    "file",
    file
  );


  formData.append(
    "upload_preset",
    UPLOAD_PRESET
  );


  // ------------------------------------------
  // Folder
  // ------------------------------------------

  formData.append(
    "folder",
    `saferoute/incidents/${incidentId}`
  );


  // ------------------------------------------
  // Optional tag
  // ------------------------------------------

  formData.append(
    "tags",
    "saferoute,evidence"
  );


  // ------------------------------------------
  // Upload
  // ------------------------------------------

  const response =
    await fetch(
      uploadURL,
      {
        method: "POST",
        body: formData,
      }
    );


  const data =
    await response.json();


  // ------------------------------------------
  // Check error
  // ------------------------------------------

  if (!response.ok) {

    console.error(
      "Cloudinary upload error:",
      data
    );

    throw new Error(
      data?.error?.message ||
      "Cloudinary upload failed."
    );
  }


  // ------------------------------------------
  // Return evidence object
  // ------------------------------------------

  return {

    url:
      data.secure_url,

    publicId:
      data.public_id,

    resourceType:
      data.resource_type,

    format:
      data.format,

    originalName:
      file.name,

    type:
      file.type,

    size:
      file.size,

    width:
      data.width || null,

    height:
      data.height || null,

    duration:
      data.duration || null,

    uploadedBy:
      userId,

    incidentId:
      incidentId,

    uploadedAt:
      new Date().toISOString(),
  };
}


// ============================================
// UPLOAD MULTIPLE FILES
// ============================================

export async function uploadEvidenceFiles(
  files,
  userId,
  incidentId
) {

  if (
    !files ||
    files.length === 0
  ) {
    return [];
  }


  const results = [];


  for (
    const file of files
  ) {

    const result =
      await uploadEvidenceFile(
        file,
        userId,
        incidentId
      );


    results.push(result);
  }


  return results;
}