import { searchPredicates } from './FDA510kService';

export async function search510kPredicates(query: string, limit = 25) {
  return searchPredicates(query, limit);
}

export default {
  search510kPredicates,
};
