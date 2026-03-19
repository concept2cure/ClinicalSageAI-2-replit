import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

import { InvoicesResponse, apiFetch, formatCurrency, formatDate, StatusBadge } from './billingTypes';

export default function InvoicesTab() {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading } = useQuery<InvoicesResponse>({
    queryKey: ['billing-invoices', page],
    queryFn: () => apiFetch<InvoicesResponse>(`/api/billing/invoices?page=${page}&pageSize=${pageSize}`),
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoices</CardTitle>
          <CardDescription>View and download your billing invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading invoices...
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!data?.invoices?.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No invoices found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.number}</TableCell>
                        <TableCell>{formatDate(inv.date)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(inv.amount)}</TableCell>
                        <TableCell>
                          <StatusBadge status={inv.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" asChild>
                              <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer">
                                <Download className="mr-1 h-3.5 w-3.5" />
                                PDF
                              </a>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <a href={`/billing/invoices/${inv.id}`}>
                                <FileText className="mr-1 h-3.5 w-3.5" />
                                View
                              </a>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({data?.total ?? 0} invoices)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
