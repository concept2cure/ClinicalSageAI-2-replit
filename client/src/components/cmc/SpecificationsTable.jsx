import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileCheck, FileSearch, BookOpen, ListChecks } from 'lucide-react'

export default function SpecificationsTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <ListChecks className="h-5 w-5 mr-2" />
          Product Specifications
        </CardTitle>
        <CardDescription>Drug substance and drug product release specifications</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Drug Substance Specifications</h3>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left font-medium p-2">Test</th>
                    <th className="text-left font-medium p-2">Analytical Method</th>
                    <th className="text-left font-medium p-2">Acceptance Criteria</th>
                    <th className="text-left font-medium p-2">Category</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="p-2">Description</td>
                    <td className="p-2">Visual</td>
                    <td className="p-2">White crystalline powder</td>
                    <td className="p-2">Physical</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Identification</td>
                    <td className="p-2">IR, HPLC</td>
                    <td className="p-2">Conforms to reference standard</td>
                    <td className="p-2">Identity</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Assay</td>
                    <td className="p-2">HPLC</td>
                    <td className="p-2">98.0% - 102.0%</td>
                    <td className="p-2 font-medium text-blue-600">Critical</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Related Substances</td>
                    <td className="p-2">HPLC</td>
                    <td className="p-2">
                      <ul className="list-disc list-inside">
                        <li>Impurity A: NMT 0.2%</li>
                        <li>Impurity B: NMT 0.2%</li>
                        <li>Any unspecified impurity: NMT 0.10%</li>
                        <li>Total impurities: NMT 0.5%</li>
                      </ul>
                    </td>
                    <td className="p-2 font-medium text-blue-600">Critical</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Residual Solvents</td>
                    <td className="p-2">GC</td>
                    <td className="p-2">
                      <ul className="list-disc list-inside">
                        <li>Methanol: NMT 3000 ppm</li>
                        <li>Acetone: NMT 5000 ppm</li>
                      </ul>
                    </td>
                    <td className="p-2">Safety</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Water Content</td>
                    <td className="p-2">Karl Fischer</td>
                    <td className="p-2">NMT 0.5%</td>
                    <td className="p-2">Physical</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Residue on Ignition</td>
                    <td className="p-2">USP &lt;731&gt;</td>
                    <td className="p-2">NMT 0.1%</td>
                    <td className="p-2">Purity</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Heavy Metals</td>
                    <td className="p-2">USP &lt;231&gt;</td>
                    <td className="p-2">NMT 10 ppm</td>
                    <td className="p-2">Safety</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Particle Size</td>
                    <td className="p-2">Laser Diffraction</td>
                    <td className="p-2">D90 NMT 100 μm</td>
                    <td className="p-2">Physical</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Drug Product Specifications</h3>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left font-medium p-2">Test</th>
                    <th className="text-left font-medium p-2">Analytical Method</th>
                    <th className="text-left font-medium p-2">Acceptance Criteria</th>
                    <th className="text-left font-medium p-2">Category</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="p-2">Description</td>
                    <td className="p-2">Visual</td>
                    <td className="p-2">White to off-white, film-coated tablets</td>
                    <td className="p-2">Physical</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Identification</td>
                    <td className="p-2">HPLC, UV</td>
                    <td className="p-2">Conforms to reference standard</td>
                    <td className="p-2">Identity</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Assay</td>
                    <td className="p-2">HPLC</td>
                    <td className="p-2">95.0% - 105.0%</td>
                    <td className="p-2 font-medium text-blue-600">Critical</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Uniformity of Dosage Units</td>
                    <td className="p-2">USP &lt;905&gt;</td>
                    <td className="p-2">AV ≤ 15.0%</td>
                    <td className="p-2 font-medium text-blue-600">Critical</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Dissolution</td>
                    <td className="p-2">USP Apparatus II</td>
                    <td className="p-2">Q ≥ 80% in 30 minutes</td>
                    <td className="p-2 font-medium text-blue-600">Critical</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Related Substances</td>
                    <td className="p-2">HPLC</td>
                    <td className="p-2">
                      <ul className="list-disc list-inside">
                        <li>Impurity A: NMT 0.5%</li>
                        <li>Impurity B: NMT 0.5%</li>
                        <li>Any unspecified impurity: NMT 0.2%</li>
                        <li>Total impurities: NMT 2.0%</li>
                      </ul>
                    </td>
                    <td className="p-2 font-medium text-blue-600">Critical</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Water Content</td>
                    <td className="p-2">Karl Fischer</td>
                    <td className="p-2">NMT 3.0%</td>
                    <td className="p-2">Physical</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">Microbial Limits</td>
                    <td className="p-2">USP &lt;61&gt;, &lt;62&gt;</td>
                    <td className="p-2">
                      <ul className="list-disc list-inside">
                        <li>TAMC: NMT 1000 CFU/g</li>
                        <li>TYMC: NMT 100 CFU/g</li>
                        <li>Absence of E. coli</li>
                      </ul>
                    </td>
                    <td className="p-2">Safety</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex justify-between w-full">
          <Button variant="outline">
            <FileSearch className="h-4 w-4 mr-2" />
            View Full Specifications
          </Button>
          <Button>
            <FileCheck className="h-4 w-4 mr-2" />
            Generate CoA
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
