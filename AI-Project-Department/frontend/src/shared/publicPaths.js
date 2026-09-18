const publicBase = import.meta.env.BASE_URL;

export const publicPath = (path) => `${publicBase}${path}`;

export const publicUrl = (path) => {
  const baseUrl = new URL(publicBase, document.baseURI).toString();
  return `${baseUrl}${path}`;
};
