using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// OS-owned controls deliberately follow Windows fonts, scaling and high contrast.
internal sealed class Launcher : Form
{
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private readonly TextBox path = new TextBox();
    private readonly Label status;
    private readonly Button open = MakeButton("Datei öffnen…");
    private readonly Button create = MakeButton("Neue Datei…");
    private readonly Button start = MakeButton("Starten");
    private readonly Button browser = MakeButton("Im Browser öffnen");
    private readonly Button stop = MakeButton("Stoppen und Datei freigeben");
    private readonly Button exit = MakeButton("Beenden");
    private bool running;
    private bool createFile;
    private bool busy;
    private bool allowClose;
    private string url;

    [STAThread]
    private static void Main()
    {
        // A winexe has no console. SetInputEncoding would call SetConsoleCP and
        // fail even though redirected pipe handles are available.
        Console.SetIn(new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false)));
        Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true });
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (var form = new Launcher()) Application.Run(form);
    }

    private Launcher()
    {
        Text = "Rotator";
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = new Font("Segoe UI", 10);
        ClientSize = new Size(800, 460);
        MinimumSize = new Size(740, 500);
        var layout = new TableLayoutPanel {
            Dock = DockStyle.Fill, Padding = new Padding(24), ColumnCount = 1, RowCount = 7,
            AutoScroll = true
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (int row = 0; row < 7; row++) layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(layout);
        var heading = AddText(layout, "Rotator", 0);
        heading.Font = new Font(Font.FontFamily, 20, FontStyle.Bold);
        AddText(layout, "SQLite-Datei auswählen und Rotator im Browser starten.", 1);
        var group = new GroupBox {
            Text = "Datenbankdatei", Dock = DockStyle.Fill, Height = 116,
            Padding = new Padding(12), Margin = new Padding(0, 0, 0, 16)
        };
        path.ReadOnly = true;
        path.AccessibleName = "Ausgewählte SQLite-Datei";
        path.Dock = DockStyle.Top;
        group.Controls.Add(path);
        var files = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 40 };
        files.Controls.AddRange(new Control[] { open, create });
        group.Controls.Add(files);
        layout.Controls.Add(group, 0, 2);
        var actions = new FlowLayoutPanel {
            Dock = DockStyle.Fill, AutoSize = true, Margin = new Padding(0, 0, 0, 16)
        };
        actions.Controls.AddRange(new Control[] { start, browser, stop });
        layout.Controls.Add(actions, 0, 3);
        status = AddText(layout, "Bereit. Vor dem Start die OneDrive-Synchronisierung abwarten.", 4);
        AddText(layout, "Dieses Fenster während der Nutzung geöffnet lassen. Beenden schließt die Datenbank. " +
            "Vor dem nächsten Start auf einem anderen Rechner die OneDrive-Synchronisierung abwarten. " +
            "Immer nur eine Instanz verwenden.", 5);
        var footer = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
        footer.Controls.Add(exit);
        layout.Controls.Add(footer, 0, 6);
        layout.SizeChanged += delegate {
            foreach (Control control in layout.Controls)
                if (control is Label) control.MaximumSize = new Size(Math.Max(300, layout.ClientSize.Width - 60), 0);
        };
        try {
            var initial = json.Deserialize<Dictionary<string, object>>(Console.ReadLine());
            path.Text = Convert.ToString(initial["databasePath"]);
            if (!String.IsNullOrEmpty(Convert.ToString(initial["error"]))) status.Text = Convert.ToString(initial["error"]);
        } catch (Exception error) { status.Text = "Startfehler: " + error.Message; }
        open.Click += delegate { SelectExisting(); };
        create.Click += delegate { SelectNew(); };
        start.Click += async delegate { await StartRotator(); };
        stop.Click += async delegate { await StopRotator(); };
        browser.Click += delegate { OpenBrowser(); };
        exit.Click += delegate { Close(); };
        FormClosing += async delegate(object sender, FormClosingEventArgs args) {
            if (allowClose) return;
            args.Cancel = true;
            if (busy) return;
            if (await StopRotator()) { allowClose = true; Close(); }
        };
        Shown += delegate { if (path.Text.Length == 0) open.Focus(); else start.Focus(); };
        UpdateControls();
    }

    private static Button MakeButton(string text)
    {
        return new Button {
            Text = text, AutoSize = true, MinimumSize = new Size(120, 36),
            Padding = new Padding(8, 0, 8, 0), Margin = new Padding(0, 0, 8, 0)
        };
    }

    private static Label AddText(TableLayoutPanel layout, string text, int row)
    {
        var label = new Label {
            Text = text, AutoSize = true, Dock = DockStyle.Fill,
            MaximumSize = new Size(740, 0), Margin = new Padding(0, 0, 0, 14)
        };
        layout.Controls.Add(label, 0, row);
        return label;
    }

    private void UpdateControls()
    {
        open.Enabled = create.Enabled = !busy && !running;
        start.Enabled = !busy && !running;
        browser.Enabled = stop.Enabled = !busy && running;
        exit.Enabled = !busy;
        UseWaitCursor = busy;
        AcceptButton = running ? browser : start;
    }

    private void SelectExisting()
    {
        using (var dialog = new OpenFileDialog {
            Title = "SQLite-Datenbank öffnen", CheckFileExists = true, FileName = path.Text,
            Filter = "SQLite-Datenbank (*.sqlite3;*.sqlite;*.db)|*.sqlite3;*.sqlite;*.db|Alle Dateien (*.*)|*.*"
        }) {
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            path.Text = dialog.FileName;
            createFile = false;
            status.Text = "Datei ausgewählt. Vor dem Start die Synchronisierung abwarten.";
            start.Focus();
        }
    }

    private void SelectNew()
    {
        using (var dialog = new SaveFileDialog {
            Title = "Neue SQLite-Datenbank anlegen", DefaultExt = "sqlite3", FileName = "rotator.sqlite3",
            Filter = "SQLite-Datenbank (*.sqlite3)|*.sqlite3", OverwritePrompt = false
        }) {
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            if (File.Exists(dialog.FileName)) {
                status.Text = "Die Datei existiert bereits. Bitte über „Datei öffnen“ auswählen oder einen neuen Namen wählen.";
                return;
            }
            path.Text = dialog.FileName;
            createFile = true;
            status.Text = "Die neue Datenbank wird beim Start angelegt.";
            start.Focus();
        }
    }

    private async Task<Dictionary<string, object>> Send(Dictionary<string, object> command, string pending)
    {
        busy = true;
        status.Text = pending;
        UpdateControls();
        try {
            Console.WriteLine(json.Serialize(command));
            Console.Out.Flush();
            string line = await Task.Run(() => Console.ReadLine());
            if (line == null) throw new IOException("Rotator ist nicht mehr erreichbar. Bitte neu starten.");
            var reply = json.Deserialize<Dictionary<string, object>>(line);
            if (!(bool)reply["ok"]) throw new IOException(Convert.ToString(reply["error"]));
            return reply;
        } catch (Exception error) {
            status.Text = "Fehler: " + error.Message;
            return null;
        } finally { busy = false; UpdateControls(); }
    }

    private async Task StartRotator()
    {
        if (path.Text.Length == 0) {
            status.Text = "Bitte zuerst eine vorhandene Datei öffnen oder eine neue Datei auswählen.";
            open.Focus();
            return;
        }
        var reply = await Send(new Dictionary<string, object> {
            { "action", "start" }, { "databasePath", path.Text }, { "create", createFile }
        }, "Rotator wird gestartet…");
        if (reply == null) return;
        running = true;
        createFile = false;
        url = Convert.ToString(reply["url"]);
        path.Text = Convert.ToString(reply["databasePath"]);
        status.Text = "Rotator läuft. Zum Freigeben der Datenbank hier stoppen oder beenden.";
        UpdateControls();
        OpenBrowser();
        browser.Focus();
    }

    private void OpenBrowser()
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch { status.Text = "Rotator läuft. Bitte diese Adresse im Browser öffnen: " + url; }
    }

    private async Task<bool> StopRotator()
    {
        var reply = await Send(new Dictionary<string, object> { { "action", "stop" } }, "Datenbank wird geschlossen…");
        if (reply == null) return false;
        running = false;
        status.Text = "Beendet. Die Datei ist freigegeben. Jetzt die OneDrive-Synchronisierung abwarten.";
        UpdateControls();
        start.Focus();
        return true;
    }
}
