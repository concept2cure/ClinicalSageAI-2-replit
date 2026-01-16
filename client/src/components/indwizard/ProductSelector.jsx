import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Plus, ChevronRight } from 'lucide-react'
import indWizardService from '@/services/indWizardService';

export default function ProductSelector({ onSelect }) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const data = await indWizardService.listProducts();
        setProducts(data);
        setFiltered(data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch products:', error);
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  useEffect(() => {
    if (query) {
      const lowercasedQuery = query.toLowerCase();
      const filteredProducts = products.filter(
        product =>
          product.name.toLowerCase().includes(lowercasedQuery) ||
          product.indication.toLowerCase().includes(lowercasedQuery) ||
          product.id.toLowerCase().includes(lowercasedQuery)
      );
      setFiltered(filteredProducts);
    } else {
      setFiltered(products);
    }
  }, [query, products]);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-semibold">Select Product for IND Submission</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search products by name or indication..."
                className="pl-9"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <Button className="gap-1">
              <Plus className="h-4 w-4" />
              <span>New Product</span>
            </Button>
          </div>

          {loading ? (
            <div className="py-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-gray-500">Loading products...</p>
            </div>
          ) : (
            <ScrollArea className="h-[320px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map(product => (
                  <div
                    key={product.id}
                    className="rounded-md border border-gray-200 p-3 cursor-pointer hover:border-blue-200 hover:bg-blue-50 transition-colors"
                    onClick={() => onSelect(product)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-blue-700">{product.name}</h3>
                        <p className="text-sm text-gray-600">{product.indication}</p>
                        <div className="flex mt-1 space-x-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {product.type}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            ID: {product.id}
                          </span>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="rounded-full p-0 h-8 w-8">
                        <ChevronRight className="h-5 w-5 text-blue-600" />
                      </Button>
                    </div>
                    <div className="mt-2 pt-2 border-t border-dashed border-gray-200">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>
                          Last updated: {new Date(product.updatedAt).toLocaleDateString()}
                        </span>
                        <span>{product.phase}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {filtered.length === 0 && (
                  <div className="col-span-full py-8 text-center border border-dashed border-gray-200 rounded-md">
                    <p className="text-sm text-gray-500">No products found matching "{query}"</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
