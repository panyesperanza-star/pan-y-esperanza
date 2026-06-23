export default function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  return response.status(200).send(JSON.stringify({
    ok: true,
    commit: 'c469dc2'
  }));
}
