import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import JSZip from 'jszip';
import { readBrukerPdata } from './services/bruker-reader.service';
import { Chart, ChartType, registerables } from 'chart.js';

// Registrar todos os componentes do Chart.js
Chart.register(...registerables);

interface TreeNode {
  name: string;
  type: 'folder' | 'file';
  path?: string;
  children?: TreeNode[];
  expanded?: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App {

  zipName: string | null = null;
  zip: JSZip | null = null;

  treeData: TreeNode[] = [];
  selectedFileName: string | null = null;
  fileContent: string | null = null;

  chart: Chart | null = null;
  @ViewChild('chartCanvas', { static: false }) chartCanvas!: ElementRef<HTMLCanvasElement>;

  /** Seleciona o ZIP e constrói a árvore de arquivos */
  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    this.zipName = file.name;
    this.zip = await JSZip.loadAsync(file);
    this.treeData = [];
    this.selectedFileName = null;
    this.fileContent = null;

    // Construir árvore de pastas e arquivos
    this.zip.forEach(path => {
      const parts = path.split('/');
      let currentLevel = this.treeData;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1 && !path.endsWith('/');
        let node = currentLevel.find(n => n.name === part);
        if (!node) {
          node = {
            name: part,
            type: isFile ? 'file' : 'folder',
            path: isFile ? path : undefined,
            children: [],
            expanded: false
          };
          currentLevel.push(node);
        }
        currentLevel = node.children!;
      }
    });
  }

  /** Expandir pasta ou abrir arquivo Bruker */
  async toggleNode(node: TreeNode, event: MouseEvent) {
    event.stopPropagation();

    if (node.type === 'folder') {
      node.expanded = !node.expanded;
    } else if (node.type === 'file' && this.zip) {
      this.selectedFileName = node.path!;
      const dataArr = await readBrukerPdata(this.zip, [node.path!]);

      if (dataArr.length > 0) {
        const arr = dataArr[0].data;

        this.fileContent =
          Array.from(arr.slice(0, 200)).join(', ') + (arr.length > 200 ? ', ...' : '');

        // canvas já existe no DOM, então podemos atualizar gráfico diretamente
        this.updateChart(arr);
      }
    }
  }

  /** Cria ou atualiza o gráfico Chart.js */
  updateChart(data: Float32Array | Float64Array | Int32Array) {
    const canvas = this.chartCanvas?.nativeElement;
    if (!canvas) return;

    // Destrói gráfico antigo se existir
    if (this.chart) this.chart.destroy();

    this.chart = new Chart(canvas, {
      type: 'line' as ChartType,
      data: {
        labels: Array.from(data.keys()).map(i => i.toString()), // labels como strings
        datasets: [{
          label: this.selectedFileName || 'RMN',
          data: Array.from(data),
          borderColor: 'blue',
          borderWidth: 1,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true } },
        scales: {
          x: { title: { display: true, text: 'Ponto' } },
          y: { title: { display: true, text: 'Intensidade' } }
        }
      }
    });
  }

}
