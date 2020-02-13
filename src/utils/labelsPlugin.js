//plug-in so that data labels appear on each dot of the line charts (the rent-stabilized units by year chart and the 311 complaints over time chart)
//see: http://www.chartjs.org/samples/latest/advanced/data-labelling.html
const LabelsPlugin = {
  afterDatasetsDraw: function(chart) {
    var ctx = chart.ctx
    chart.data.datasets.forEach(function(dataset, i) {
      var meta = chart.getDatasetMeta(i)
      if (!meta.hidden) {
        meta.data.forEach(function(element, index) {
          // Draw the text in black, with the specified font
          ctx.fillStyle = 'rgb(100, 100, 100)'
          var fontSize = 10
          var fontStyle = 'normal'
          var fontFamily = 'Helvetica Neue'
          ctx.font = Chart.helpers.fontString(fontSize, fontStyle, fontFamily)
          let dataNum = 0
          if (dataset.data[index] != null) {
            dataNum = dataset.data[index]
          }
          // Just naively convert to string for now
          var dataString = dataNum.toString()
          // Make sure alignment settings are correct
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          var padding = -15
          var position = element.tooltipPosition()

          if (dataString != 0) {
            ctx.fillText(
              dataString,
              position.x,
              position.y - fontSize / 2 - padding
            )
          }
        })
      }
    })
  }
}

export default LabelsPlugin
