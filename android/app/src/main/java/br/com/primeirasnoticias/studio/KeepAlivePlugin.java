package br.com.primeirasnoticias.studio;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Mantém a exportação rodando com o app em segundo plano: liga um serviço em
 * primeiro plano (notificação "Exportando vídeo") e impede o WebView de pausar.
 */
@CapacitorPlugin(name = "KeepAlive")
public class KeepAlivePlugin extends Plugin {

    static volatile boolean active = false;

    @PluginMethod
    public void start(PluginCall call) {
        active = true;
        try {
            if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4711);
            }
            Intent i = new Intent(getContext(), ExportService.class);
            i.putExtra("title", call.getString("title", "Exportando vídeo"));
            ContextCompat.startForegroundService(getContext(), i);
        } catch (Exception e) {
            // sem o serviço a exportação continua, só sem a proteção em segundo plano
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        active = false;
        try {
            getContext().stopService(new Intent(getContext(), ExportService.class));
        } catch (Exception e) {
            // já parado
        }
        call.resolve();
    }
}
