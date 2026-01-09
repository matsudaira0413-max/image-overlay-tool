export default async function handler(request, response) {
  // CORS設定: すべてのオリジンからのアクセスを許可
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // OPTIONSリクエスト（プリフライト）の場合はすぐに200を返す
  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  const { url } = request.query;

  if (!url) {
    response.status(400).send("URL parameter is required");
    return;
  }

  try {
    // 画像を取得
    const imageResponse = await fetch(url);
    
    if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 画像のContent-Typeを取得して設定
    const contentType = imageResponse.headers.get('content-type') || 'application/octet-stream';
    response.setHeader('Content-Type', contentType);
    
    // 画像データを返す
    response.send(buffer);

  } catch (error) {
    console.error("Proxy error:", error);
    response.status(500).send(`Error fetching image: ${error.message}`);
  }
}
