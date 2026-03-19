/**
 * AltiEDA – Export Packager
 * Bundles all manufacturing files into a downloadable ZIP via JSZip.
 */
import JSZip from 'jszip';
import {
  generateTopCopperGerber,
  generateBottomCopperGerber,
  generateSilkscreenGerber,
  generateExcellonDrillFile,
  generateBOM,
  generatePickAndPlace,
} from './gerberGenerator.js';

export async function exportManufacturingPackage(projectName = 'AltiEDA_Project') {
  const zip    = new JSZip();
  const folder = zip.folder(projectName);

  // Gerber files
  folder.file(`${projectName}-F_Cu.gbr`,      generateTopCopperGerber());
  folder.file(`${projectName}-B_Cu.gbr`,      generateBottomCopperGerber());
  folder.file(`${projectName}-F_SilkS.gbr`,   generateSilkscreenGerber());

  // Drill file
  folder.file(`${projectName}.drl`,           generateExcellonDrillFile());

  // Assembly files
  folder.file(`${projectName}_BOM.csv`,        generateBOM());
  folder.file(`${projectName}_CPL.csv`,        generatePickAndPlace());

  // README
  folder.file('README.txt', [
    `AltiEDA Manufacturing Export`,
    `Project: ${projectName}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    'Files:',
    '  *-F_Cu.gbr     → Top copper layer (RS-274X Gerber)',
    '  *-B_Cu.gbr     → Bottom copper layer (RS-274X Gerber)',
    '  *-F_SilkS.gbr  → Front silkscreen (RS-274X Gerber)',
    '  *.drl           → NC drill file (Excellon)',
    '  *_BOM.csv      → Bill of Materials',
    '  *_CPL.csv      → Pick-and-Place (Component Position)',
  ].join('\n'));

  const blob = await zip.generateAsync({ type: 'blob' });
  _downloadBlob(blob, `${projectName}_Gerbers.zip`);
  return blob;
}

function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
