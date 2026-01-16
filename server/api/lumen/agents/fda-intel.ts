import axios from 'axios';
const URL = 'https://api.fda.gov/device/510k.json';
export async function query(term: string) {
  try {
    const res = await axios.get(`${URL}?search=device_name:"${term}"&limit=5`);
    return res.data.results.map(r => ({ k: r.k_number, name: r.device_name, applicant: r.applicant }));
  } catch (e) { return []; }
}
