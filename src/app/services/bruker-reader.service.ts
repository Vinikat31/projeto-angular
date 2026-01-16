import JSZip from 'jszip';

export interface BrukerData {
  parameters: Record<string, any>;
  data: Float32Array | Int32Array;
}

/**
 * Lê arquivos processados do Bruker diretamente do ZIP
 */
export async function readBrukerPdata(
  zip: JSZip,
  binFiles: string[] = ['1r'],
  procsFile: string = 'procs',
  scaleData: boolean = true
): Promise<BrukerData[]> {

  // Lê arquivo de parâmetros procs
  const procsText = await zip.file(procsFile)?.async('string');
  const parameters: Record<string, any> = {};
  if (procsText) {
    procsText.split('\n').forEach(line => {
      const match = line.match(/##\$([A-Z0-9_]+)=(.*)/);
      if (match) parameters[match[1]] = match[2].trim();
    });
  }

  const NC_proc = parameters['NC_proc'] ? parseInt(parameters['NC_proc']) : 0;
  const BYTORDP = parameters['BYTORDP'] ? parseInt(parameters['BYTORDP']) : 0;
  const DTYPP  = parameters['DTYPP'] ? parseInt(parameters['DTYPP']) : 0;

  const littleEndian = BYTORDP === 0;
  const isFloat = DTYPP === 2;

  const dataArray: BrukerData[] = [];

  for (const fileName of binFiles) {
    const file = zip.file(fileName);
    if (!file) continue;

    const buffer = await file.async('arraybuffer');
    const view = new DataView(buffer);
    const length = buffer.byteLength / (isFloat ? 4 : 4); // float32 ou int32 -> 4 bytes cada
    const typedArray = isFloat ? new Float32Array(length) : new Int32Array(length);

    for (let i = 0; i < length; i++) {
      typedArray[i] = isFloat 
        ? view.getFloat32(i * 4, littleEndian) 
        : view.getInt32(i * 4, littleEndian);
    }

    // Aplica escala 2^-NC_proc se necessário
    if (scaleData && NC_proc !== 0) {
      const scaleFactor = Math.pow(2, -NC_proc);
      for (let i = 0; i < typedArray.length; i++) typedArray[i] *= scaleFactor;
    }

    dataArray.push({ parameters, data: typedArray });
  }

  return dataArray;
}
